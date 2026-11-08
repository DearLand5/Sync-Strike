/* =====================================================================
   Наборы «тяжёлого» ближнего боя: Ночное копьё (spear), Лунная глефа (glaive), Боевой топор (axe).
   У каждого — своя манера анимаций всех атак (kit.pose), по две собственные комбинации (kit.moves + kit.choose)
   и своё добивание (registerTakedown + kit.takedown). API — в 12d_kits.js.
   Копьё: двуручный хват, широкая стойка, выпады, вращение древка. Глефа: широкие дуги корпусом, разворот через плечо,
   тяжёлая инерция. Топор: замах из-за головы, рубящий удар сверху вниз с приседом, долгое восстановление.
   Углы позы: armF — рука от «вниз» (π/2 вперёд, π вверх, <0 назад); wAngle при wBlend=1 — направление оружия
   (0 вперёд, −π/2 вверх, +π/2 вниз, π назад).
   ===================================================================== */
{
  const ph3 = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const PI = Math.PI;
  /** Готов ли приём (перезарядка в секундах боевого времени; метки после сброса боя не блокируют). */
  const ready = (cs, key, cd) => { const m = cs._kitT || (cs._kitT = {}), t = m[key]; return t == null || t > cs.time || cs.time - t > cd; };
  const stamp = (cs, key) => { (cs._kitT || (cs._kitT = {}))[key] = cs.time; };
  const MELEE_NAMES = ["slash1", "slash2", "slash3", "thrust", "rise", "flurry", "cross"];
  /** Живые враги вплотную: сколько и с каких сторон. */
  const around = (cs, r) => {
    const g = cs.game, p = g.player; let l = 0, rt = 0;
    for (const e of g.enemies) {
      if (!e.targetable || Math.abs(e.y - p.y) > 40) continue;
      const dx = e.x - p.x;
      if (Math.abs(dx) - e.w * e.scale / 2 <= r) { if (dx < 0) l++; else rt++; }
    }
    return { l, r: rt, n: l + rt };
  };

  /* ---------- бумеранг: бросок оружия и возврат (копьё, топор) ---------- */
  /** Запуск: снаряд-пронзатель от кисти, летит к цели и дальше, затем возвращается к руке. */
  function throwLaunch(g, p, act, o) {
    const cs = g.combat, tg = act.target, h = CharacterRenderer.handWorld(p, 16);
    const dist = tg ? Math.abs(tg.x - p.x) : 160;
    const ang = tg ? clamp(Math.atan2(tg.centerY - h.y, Math.abs(tg.x - h.x)), -0.3, 0.3) : 0;
    const b = { x: h.x, y: h.y, vx: act.dir * Math.cos(ang) * o.speed, vy: Math.sin(ang) * o.speed, owner: "player", act, r: o.r, color: p.skin.accent, life: 1.2, pierce: true, boom: o, out: true, x0: h.x, range: clamp(dist + 70, 170, 300), spin: 0 };
    cs.spawnProjectile(b);
    act.proj = b; act.caught = false; act.fxT = 0;
  }
  /** Шаг полёта: поворот на дальности, возврат к руке, след. Вызывается из def.update. */
  function throwStep(cs, p, act, dt) {
    const b = act.proj, g = cs.game;
    if (!b || act.caught) return;
    const o = b.boom;
    if (b.life <= 0) { act.caught = true; return; }
    const h = CharacterRenderer.handWorld(p, 4);
    if (b.out) {
      if (Math.abs(b.x - b.x0) >= b.range || b.x < 24 || b.x > WORLD.w - 24 || act.t > act.startup + 0.34) {
        b.out = false; b.hit.clear();
        g.fx.ring(b.x, b.y, 3, 14, "#ffffff", 0.18, 1.6);
        g.sfx("slash", 0.8);
      }
    } else {
      const dx = h.x - b.x, dy = h.y - b.y, l = Math.hypot(dx, dy) || 1;
      b.vx = dx / l * o.speed * 0.95; b.vy = dy / l * o.speed * 0.95;
      if (l < 16 || act.t > act.total - 0.03) {
        b.life = 0; act.caught = true;
        g.fx.ring(h.x, h.y, 2, 16, "#ffffff", 0.16, 1.6); g.fx.glow(h.x, h.y, 3, 14, p.skin.accent, 0.12, 0.5);
        g.sfx("hit", 0.7); g.camera.kick(0.008);
      }
    }
    // след: заострённый росчерк по линии полёта (копьё) либо вращающийся топор из двух чёрточек
    act.fxT -= dt;
    if (act.fxT <= 0 && !act.caught) {
      act.fxT = 0.012;
      const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp, col = p.skin.accent;
      if (o.kind === "spear") {
        g.fx.cut(b.x - ux * 30, b.y - uy * 30, b.x + ux * 8, b.y + uy * 8, col, 2.4, 0.07);
        g.fx.cut(b.x - ux * 22, b.y - uy * 22, b.x + ux * 8, b.y + uy * 8, "#ffffff", 1, 0.05);
      } else {
        b.spin += dt * (b.out ? 1 : -1) * 34 * act.dir;
        const c = Math.cos(b.spin), s = Math.sin(b.spin);
        g.fx.line(b.x - c * 9, b.y - s * 9, b.x + c * 9, b.y + s * 9, "#ffffff", 1.2, 0.05);
        g.fx.line(b.x + c * 8 - s * 6, b.y + s * 8 + c * 6, b.x + c * 8 + s * 6, b.y + s * 8 - c * 6, col, 3.2, 0.05);
      }
    }
  }

  /* =====================================================================
     НОЧНОЕ КОПЬЁ
     ===================================================================== */
  /** Двуручный хват: задняя рука идёт за передней вдоль древка. */
  const twoHand = (P, back = 0.55) => { P.armB = (P.armF || 0) - back; };

  function spearPose(P, act, p, k) {
    if (act.def.kit) return;                         // свои приёмы рисуют себя сами
    const nm = act.name, ph = act.phase, air = !p.onGround;
    const S = ph === "startup", A = ph === "active", T = ph === "travel", R = ph === "recovery";
    if (nm === "slash3" || nm === "airSpin" || nm === "riposte") {
      // вращение древка: подготовка — копьё заводится за плечо, удар — полный оборот древка вокруг кисти
      const turns = nm === "riposte" ? 1.5 : 1;
      if (S) Object.assign(P, { armF: lerp(0.4, 1.7, easeOut(k.s)), elbowF: 0.2, wBlend: 1, wAngle: lerp(-0.2, -1.9, easeOut(k.s)), lean: -0.18, bodyY: 2.2 * k.s, legSpread: 1.9, sx: 1.05 });
      else if (A) Object.assign(P, { armF: 1.5, elbowF: 0.2, wBlend: 1, wAngle: -1.9 + TAU * turns * easeInOut(k.a), lean: 0.3, bodyY: 2.4, legSpread: 2.0, sx: 0.55 + 0.5 * Math.abs(Math.cos(PI * k.a * turns)), sy: 0.94, cloak: -1 });
      else Object.assign(P, { armF: lerp(1.5, 0.5, easeInOut(k.r)), elbowF: 0.3, wBlend: 1, wAngle: lerp(0, -0.9, easeInOut(k.r)), lean: 0.2 * (1 - k.r), legSpread: lerp(1.9, 1.3, k.r) });
      if (nm === "riposte" && A) P.sx = 0.45 + 0.65 * Math.abs(Math.cos(PI * k.a * 2));
      twoHand(P, 0.5);
      if (nm === "airSpin") P.tuck = 0.3;
      return;
    }
    if (nm === "rise") {
      // подъёмный выпад: копьё снизу вверх, под самый подбородок
      const up = -1.25;
      if (S) Object.assign(P, { armF: lerp(0.3, 0.9, easeOut(k.s)), elbowF: 0.3, wBlend: 1, wAngle: lerp(0.1, 0.55, k.s), lean: 0.3, bodyY: 3.4 * k.s, legSpread: 2.1, sx: 1.1, sy: 0.88 });
      else if (A) Object.assign(P, { armF: lerp(0.9, 2.5, easeOut(k.a)), elbowF: 0.1, wBlend: 1, wAngle: lerp(0.55, up, easeOut(k.a)), lean: -0.2, bodyY: -1, legSpread: 1.5, sx: 0.92, sy: 1.12, tuck: p.onGround ? 0 : 0.35 });
      else Object.assign(P, { armF: lerp(2.5, 0.6, easeInOut(k.r)), elbowF: 0.2, wBlend: 1, wAngle: lerp(up, -0.2, easeInOut(k.r)), lean: lerp(-0.1, 0.1, k.r) });
      twoHand(P, 0.6);
      return;
    }
    if (nm === "dash" || nm === "pierce") {
      // длинный выпад: низко над землёй, копьё впереди по горизонтали
      if (S) Object.assign(P, { armF: lerp(0.3, -0.3, easeOut(k.s)), elbowF: 0.9, wBlend: 1, wAngle: -0.1, lean: -0.25, bodyY: 2.6 * k.s, legSpread: 2.2, sx: 1.06, sy: 0.92 });
      else if (T) Object.assign(P, { armF: 1.45, elbowF: 0, wBlend: 1, wAngle: 0, lean: 0.85, tuck: 0.2, bodyY: 3, legSpread: 2.4, sx: 1.22, sy: 0.82, cloak: -1.1 });
      else if (A) Object.assign(P, { armF: 1.5, elbowF: 0, wBlend: 1, wAngle: 0, lean: 0.75, bodyY: 3.2, legSpread: 2.5, sx: 1.2, sy: 0.84, cloak: -1 });
      else Object.assign(P, { armF: lerp(1.5, 0.5, easeInOut(k.r)), elbowF: 0.1, wBlend: 1, wAngle: lerp(0, -0.5, easeInOut(k.r)), lean: 0.4 * (1 - k.r), bodyY: 3 * (1 - easeOut(k.r)), legSpread: lerp(2.4, 1.4, k.r) });
      twoHand(P, 0.45);
      return;
    }
    if (act.def.kind === "dive") {
      // копьё остриём вниз: падение «на копьё»
      const slam = nm === "meteor";
      if (S) Object.assign(P, slam ? { armF: 3.0, elbowF: 0, wBlend: 1, wAngle: -1.45, tuck: 0.3, lean: -0.1, sy: 1.1 } : { armF: 2.4, elbowF: 0.2, wBlend: 1, wAngle: -0.8, tuck: 0.4 });
      else Object.assign(P, { armF: 2.9, elbowF: 0, wBlend: 1, wAngle: PI / 2, lean: 0.12, tuck: 0.5, sx: 0.88, sy: 1.18, cloak: 1 });
      twoHand(P, 0.3);
      return;
    }
    // уколы (slash1/2, thrust, flurry, cross, airSlash): выпад в широкой стойке
    const lowJab = nm === "slash2", rep = (act.def.hits || 1) > 1;
    const aim = lowJab ? 0.28 : nm === "airSlash" ? 0.6 : 0;
    const u = rep ? (k.a * act.def.hits) % 1 : k.a;
    if (S) Object.assign(P, {
      armF: lerp(0.5, -0.55, easeOut(k.s)), elbowF: 1.1, wBlend: 1, wAngle: lowJab ? -0.5 : 0.05 - 0.3 * k.s, lean: -0.2 * k.s, bodyY: 2.4 * k.s, legSpread: 1.9 + 0.3 * k.s, sx: 1.04, sy: 0.95,
    });
    else if (T) Object.assign(P, { armF: 1.45, elbowF: 0, wBlend: 1, wAngle: aim, lean: 0.6, bodyY: 2.5, legSpread: 2.3, sx: 1.15, sy: 0.88 });
    else if (A) Object.assign(P, {
      armF: rep ? lerp(1.0, 1.5, Math.sin(PI * Math.min(1, u * 1.4))) : lerp(-0.2, 1.5, easeOut(k.a * 1.6)), elbowF: 0, wBlend: 1, wAngle: aim, lean: 0.5, bodyY: 2.8, legSpread: 2.3 + 0.2 * k.a, sx: 1.16, sy: 0.9, cloak: -0.7,
    });
    else Object.assign(P, { armF: lerp(1.5, 0.5, easeInOut(k.r)), elbowF: 0.2 * k.r, wBlend: 1, wAngle: lerp(aim, -0.4, easeInOut(k.r)), lean: 0.3 * (1 - k.r), bodyY: 2.8 * (1 - easeOut(k.r)) + Math.sin(k.r * PI) * 0.5, legSpread: lerp(2.3, 1.4, k.r), sx: 1 + 0.1 * (1 - k.r) });
    twoHand(P, 0.5);
    if (!p.onGround) P.tuck = 0.35;
  }

  const spearMoves = {
    // удар на сильной доле после двух точных ударов: копьё вращается над головой и бьёт по кругу три раза
    spear_whirl: {
      kind: "custom", name: "Вращение древка", startup: 0.07, active: 0.27, recovery: 0.22, cancel: 0.2,
      dmg: 9, reach: 48, knock: 330, stun: 0.55, hits: 3,
      fx(g, p, act) { g.sfx("slash", 1.5); p.vx = 0; },
      update(cs, p, act, dt, tA) {
        const g = cs.game, def = act.def;
        p.vx = damp(p.vx, 0, 12, dt);
        if (act.phase !== "active") return;
        const n = Math.min(def.hits - 1, Math.floor((act.t - tA) / (def.active / def.hits)));
        if (act.tick == null || n > act.tick) {
          act.tick = n; act.sub = n; act.hit.clear();
          const cx = p.x, cy = p.y - 22, col = p.skin.accent, a0 = n * 2.1;
          g.fx.slashArc(cx, cy, 40, a0, a0 + 3.3, col, 7, 0.22);
          g.fx.slashArc(cx, cy, 35, a0 + 0.3, a0 + 3.0, "#ffffff", 1.6, 0.14);
          if (n === 0) g.fx.ring(cx, cy, 8, 50, col, 0.28, 3);
          if (n > 0) g.sfx("slash", 1.3 + 0.2 * n);
          if (n === def.hits - 1) g.camera.shake(0.18);
        }
        cs._meleeHits(p, act, true);
      },
      pose(P, act, p, k) {
        if (act.phase === "startup") Object.assign(P, { armF: lerp(0.4, 2.7, easeOut(k.s)), elbowF: 0.1, wBlend: 1, wAngle: lerp(0, -1.57, easeOut(k.s)), lean: -0.1, bodyY: 3 * k.s, legSpread: 2.1, sx: 1.05, sy: 0.9 });
        else if (act.phase === "active") Object.assign(P, { armF: 2.7, elbowF: 0.1, wBlend: 1, wAngle: -1.57 + TAU * 2 * easeInOut(k.a), lean: 0.08, bodyY: 2, legSpread: 2.0, sx: 0.5 + 0.5 * Math.abs(Math.cos(PI * k.a * 3)), sy: 0.96, cloak: 1.3, headTilt: 0.1 });
        else Object.assign(P, { armF: lerp(2.7, 0.6, easeInOut(k.r)), elbowF: 0.2, wBlend: 1, wAngle: lerp(-1.57, -0.3, easeInOut(k.r)), lean: 0.2 * (1 - k.r), bodyY: 2 * (1 - k.r), legSpread: lerp(2, 1.4, k.r), cloak: 0.6 * (1 - k.r) });
        twoHand(P, 0.4);
      },
    },
    // точное нажатие по дальней цели: копьё улетает светящимся росчерком сквозь врагов и возвращается в руку
    spear_throw: {
      kind: "custom", name: "Бросок-возврат", startup: 0.1, active: 0.5, recovery: 0.16, cancel: 0.42,
      dmg: 13, knock: 150, stun: 0.35,
      fx(g, p, act) {
        stamp(g.combat, "spearThrow"); g.sfx("slash", 1.1); g.camera.kick(0.012);
        throwLaunch(g, p, act, { kind: "spear", speed: 1150, r: 5 });
        const h = CharacterRenderer.handWorld(p, 10);
        g.fx.glow(h.x, h.y, 3, 18, "#ffffff", 0.12, 0.5);
      },
      update(cs, p, act, dt) { p.vx = damp(p.vx, 0, 14, dt); if (act.phase !== "startup") throwStep(cs, p, act, dt); },
      pose(P, act, p, k) {
        const s = act.phase === "startup", fly = act.phase === "active" && !act.caught;
        if (s) Object.assign(P, { armF: lerp(0.4, -0.9, easeOut(k.s)), elbowF: 1.0, wBlend: 1, wAngle: lerp(0, -0.35, k.s), lean: -0.3 * k.s, bodyY: 2.5 * k.s, legSpread: 2.2, sx: 1.05 });
        else if (act.phase === "active") Object.assign(P, { armF: fly ? 1.5 : lerp(1.5, 0.9, 0.5), elbowF: 0, wBlend: 1, wAngle: -0.05, lean: 0.55, bodyY: 3, legSpread: 2.4, sx: 1.16, sy: 0.9, cloak: -0.8, armB: -0.2 });
        else Object.assign(P, { armF: lerp(1.2, 0.5, easeInOut(k.r)), elbowF: 0.2, wBlend: 1, wAngle: lerp(0, -0.5, easeInOut(k.r)), lean: 0.25 * (1 - k.r), bodyY: 2.4 * (1 - easeOut(k.r)), legSpread: lerp(2.2, 1.4, k.r) });
        if (s || !act.caught && act.phase === "active") { if (!s) P.armB = -0.2; else twoHand(P, 0.5); }
        else twoHand(P, 0.5);
        if (fly) p.weapon = "none";                  // копьё в полёте — в руке пусто
      },
    },
  };

  /* =====================================================================
     ЛУННАЯ ГЛЕФА
     ===================================================================== */
  function glaivePose(P, act, p, k) {
    if (act.def.kit) return;
    const nm = act.name, S = act.phase === "startup", A = act.phase === "active", T = act.phase === "travel";
    const heavy = (kk, a, b) => lerp(a, b, easeInOut(kk));            // тяжёлая инерция: медленно-быстро-медленно
    if (nm === "slash3" || nm === "airSpin" || nm === "riposte") {
      // полный оборот корпуса: глефа чертит круг, силуэт сужается на развороте
      if (S) Object.assign(P, { armF: heavy(k.s, 0.4, -1.5), elbowF: 0.2, wBlend: 1, wAngle: heavy(k.s, 0, PI + 0.3), lean: -0.3 * k.s, bodyY: 2.6 * k.s, legSpread: 2.0, sx: 1 - 0.2 * k.s, cloak: 1 * k.s });
      else if (A) Object.assign(P, { armF: lerp(-1.5, 2.2, easeInOut(k.a)), elbowF: 0.1, wBlend: 1, wAngle: PI + 0.3 + TAU * easeInOut(k.a) * (nm === "riposte" ? 1.5 : 1), lean: 0.38, bodyY: 3.2, legSpread: 2.2, sx: 0.4 + 0.65 * Math.abs(Math.cos(PI * k.a * (nm === "riposte" ? 2 : 1))), sy: 0.92, cloak: -1.3, armB: 1.3 });
      else Object.assign(P, { armF: heavy(k.r, 2.2, 0.5), elbowF: 0.3, wBlend: 1, wAngle: heavy(k.r, 0.4, -0.5), lean: heavy(k.r, 0.35, 0), bodyY: 3 * (1 - easeOut(k.r)), legSpread: lerp(2.2, 1.3, k.r), cloak: -0.8 * (1 - k.r) });
      if (nm === "airSpin") P.tuck = 0.3;
      return;
    }
    if (nm === "rise") {
      // подъёмная дуга снизу позади — вверх через плечо
      if (S) Object.assign(P, { armF: heavy(k.s, 0.3, -0.8), elbowF: 0.2, wBlend: 1, wAngle: heavy(k.s, 0, 2.5), lean: 0.4 * k.s, bodyY: 4 * k.s, legSpread: 2.2, sx: 1.12, sy: 0.86 });
      else if (A) Object.assign(P, { armF: lerp(-0.8, 3.0, easeOut(k.a)), elbowF: 0.1, wBlend: 1, wAngle: lerp(2.5, -1.5, easeOut(k.a)), lean: lerp(0.4, -0.25, k.a), bodyY: -1, legSpread: 1.5, sx: 0.9, sy: 1.14, cloak: 1, tuck: p.onGround ? 0 : 0.35 });
      else Object.assign(P, { armF: heavy(k.r, 3.0, 0.5), elbowF: 0.2, wBlend: 1, wAngle: heavy(k.r, -1.5, -0.4), lean: lerp(-0.2, 0.05, k.r), bodyY: 0 });
      return;
    }
    if (nm === "dash" || nm === "pierce") {
      // рывок со скользящим ударом: глефа тянется сбоку-сзади, по земле, и взмывает вперёд
      if (S) Object.assign(P, { armF: heavy(k.s, 0.3, -1.2), elbowF: 0.3, wBlend: 1, wAngle: heavy(k.s, 0, 2.7), lean: -0.2, bodyY: 2.8 * k.s, legSpread: 2.2, sx: 1.04 });
      else if (T) Object.assign(P, { armF: -1.2, elbowF: 0.3, wBlend: 1, wAngle: 2.7, lean: 0.8, tuck: 0.2, bodyY: 3, legSpread: 2.4, sx: 1.2, sy: 0.86, cloak: -1.1 });
      else if (A) Object.assign(P, { armF: lerp(-1.2, 2.0, easeOut(k.a)), elbowF: 0.1, wBlend: 1, wAngle: lerp(2.7, -0.4, easeOut(k.a)), lean: 0.65, bodyY: 3.4, legSpread: 2.5, sx: 1.18, sy: 0.86, cloak: -1 });
      else Object.assign(P, { armF: heavy(k.r, 2.0, 0.5), elbowF: 0.3, wBlend: 1, wAngle: heavy(k.r, -0.4, -0.5), lean: 0.4 * (1 - k.r), bodyY: 3 * (1 - easeOut(k.r)), legSpread: lerp(2.5, 1.3, k.r) });
      return;
    }
    if (act.def.kind === "dive") {
      if (S) Object.assign(P, { armF: 3.0, elbowF: 0, wBlend: 1, wAngle: -1.2, tuck: 0.3, lean: -0.2, sy: 1.1 });
      else Object.assign(P, { armF: 2.4, elbowF: 0.1, wBlend: 1, wAngle: 1.2, lean: 0.35, tuck: 0.55, sx: 0.9, sy: 1.16, cloak: 1 });
      return;
    }
    // обычные дуги (slash1/2, thrust, flurry, cross, airSlash): широкий размах корпусом
    const second = nm === "slash2" || (nm === "cross" && false);
    const wide = nm === "thrust" ? 0.5 : 1;
    // slash1: из-за плеча сверху-вниз; slash2: снизу-вверх встречной дугой
    const w0 = second ? 2.7 : -2.5, w1 = second ? -1.0 : 0.9;
    const a0 = second ? -0.6 : -1.7, a1 = second ? 2.4 : 2.0;
    if (S) Object.assign(P, { armF: heavy(k.s, 0.3, a0), elbowF: 0.2, wBlend: 1, wAngle: heavy(k.s, 0, w0), lean: -0.3 * k.s * wide, bodyY: 2.8 * k.s, legSpread: 2.0 + 0.3 * k.s, sx: 1 - 0.22 * k.s, sy: 0.96, cloak: 1.2 * k.s, headTilt: 0.12 * k.s });
    else if (T) Object.assign(P, { armF: a0, elbowF: 0.2, wBlend: 1, wAngle: w0, lean: 0.55, bodyY: 2.6, legSpread: 2.3, sx: 1.1, sy: 0.9 });
    else if (A) Object.assign(P, { armF: lerp(a0, a1, easeOut(k.a)), elbowF: 0.1, wBlend: 1, wAngle: lerp(w0, w1, easeOut(k.a)), lean: 0.45 * wide + 0.1, bodyY: 3.2, legSpread: 2.4, sx: 1.18, sy: 0.88, cloak: -1.1, armB: 1.2, headTilt: -0.1 });
    else Object.assign(P, { armF: heavy(k.r, a1, 0.5), elbowF: 0.3 * k.r, wBlend: 1, wAngle: heavy(k.r, w1, -0.5), lean: 0.35 * (1 - k.r) - 0.05 * Math.sin(k.r * PI), bodyY: 3.2 * (1 - easeOut(k.r)) + Math.sin(k.r * PI) * 0.8, legSpread: lerp(2.4, 1.3, k.r), sx: 1.1 - 0.1 * k.r, cloak: -0.8 * (1 - k.r) });
    if (!p.onGround) P.tuck = 0.35;
  }

  const glaiveMoves = {
    // окружён вплотную и точное нажатие: полный круг глефы по всем сторонам, две половины дуги — два удара
    glaive_circle: {
      kind: "custom", name: "Лунный круг", startup: 0.11, active: 0.3, recovery: 0.3, cancel: 0.26,
      dmg: 14, reach: 60, knock: 300, stun: 0.6, hits: 2,
      fx(g, p, act) { stamp(g.combat, "circle"); g.sfx("slash", 1.2); },
      update(cs, p, act, dt, tA) {
        const g = cs.game, def = act.def;
        p.vx = damp(p.vx, 0, 12, dt);
        if (act.phase !== "active") return;
        const n = Math.min(def.hits - 1, Math.floor((act.t - tA) / (def.active / def.hits)));
        if (act.tick == null || n > act.tick) {
          act.tick = n; act.sub = n; act.hit.clear();
          const cx = p.x, cy = p.y - 20, col = p.skin.accent;
          // половина кольца: верхняя дуга, затем нижняя (глефа чертит круг вокруг героя)
          const a0 = n ? 0 : PI;
          g.fx.slashArc(cx, cy, 48, a0 - 0.15, a0 + PI + 0.15, col, 10, 0.26);
          g.fx.slashArc(cx, cy, 43, a0, a0 + PI, "#ffffff", 2, 0.16);
          if (n === 0) { g.fx.glow(cx, cy, 10, 56, col, 0.2, 0.3); g.camera.shake(0.14); }
          else { g.fx.ring(cx, cy, 14, 66, "#ffffff", 0.3, 2); g.camera.shake(0.26); g.sfx("slash", 1.5); }
        }
        cs._meleeHits(p, act, true);
      },
      pose(P, act, p, k) {
        if (act.phase === "startup") Object.assign(P, { armF: lerp(0.3, -1.5, easeInOut(k.s)), elbowF: 0.2, wBlend: 1, wAngle: lerp(0, PI + 0.2, easeInOut(k.s)), lean: -0.3 * k.s, bodyY: 3.4 * k.s, legSpread: 2.3, sx: 1 - 0.2 * k.s, cloak: 1.3 * k.s });
        else if (act.phase === "active") Object.assign(P, { armF: 1.7, elbowF: 0, wBlend: 1, wAngle: PI + 0.2 + TAU * easeInOut(k.a), lean: 0.1, bodyY: 2.4, legSpread: 2.3, sx: 0.45 + 0.6 * Math.abs(Math.cos(PI * k.a * 2)), sy: 0.95, cloak: -1.4, armB: 1.0 });
        else Object.assign(P, { armF: lerp(1.7, 0.5, easeInOut(k.r)), elbowF: 0.3, wBlend: 1, wAngle: lerp(0.2, -0.5, easeInOut(k.r)), lean: 0.2 * (1 - k.r), bodyY: 2.4 * (1 - easeOut(k.r)) + Math.sin(k.r * PI) * 0.8, legSpread: lerp(2.3, 1.3, k.r), cloak: -0.9 * (1 - k.r) });
      },
    },
    // «и» после двух ударов в долю: низкая подсечка у самых ног — враг теряет опору и падает
    glaive_sweep: {
      kind: "custom", name: "Подсечка", startup: 0.07, active: 0.13, recovery: 0.27, cancel: 0.2,
      dmg: 20, reach: 64, knock: 140, stun: 1.2,
      fx(g, p, act) {
        stamp(g.combat, "sweep");
        const y = p.y - 4, d = act.dir, col = p.skin.accent;
        g.sfx("slash", 0.9);
        g.fx.slashArc(p.x + d * 6, y - 8, 50, d > 0 ? -0.55 : PI - 0.1, d > 0 ? 0.1 : PI + 0.55, col, 8, 0.2);
        g.fx.cut(p.x - d * 8, y, p.x + d * 66, y - 2, "#ffffff", 1.6, 0.18);
        g.fx.dust(p.x + d * 24, p.y, 6);
      },
      update(cs, p, act, dt, tA) {
        const g = cs.game, def = act.def, d = act.dir;
        p.vx = act.phase === "active" ? d * 90 : damp(p.vx, 0, 12, dt);
        if (act.phase !== "active") return;
        // низкая полоса у ног: задевает только стоящих на этом же уровне
        const box = { x: d > 0 ? p.x - 4 : p.x - def.reach + 4, y: p.y - 14, w: def.reach, h: 20 };
        for (const e of g.enemies) {
          if (!e.targetable || act.hit.has(e.id) || Math.abs(e.y - p.y) > 22) continue;
          const eb = { x: e.x - e.w * e.scale / 2, y: e.y - e.h * e.scale, w: e.w * e.scale, h: e.h * e.scale };
          if (!rectsOverlap(box, eb)) continue;
          act.hit.add(e.id);
          e.poise = 0;                                           // подсечка ломает стойку
          cs._applyHit(e, act, d, e.x, e.y - 6);
          if (e.alive && !e.executed && e.kind !== "brute") { e.vy = -210; e.vx = d * 140; e.onGround = false; e.hitKick = 1; }
          g.fx.dust(e.x, e.y, 5);
        }
      },
      pose(P, act, p, k) {
        // глубокий присед, глефа скользит у самой земли
        if (act.phase === "startup") Object.assign(P, { armF: lerp(0.3, -0.6, easeOut(k.s)), elbowF: 0.4, wBlend: 1, wAngle: lerp(0, 2.2, easeOut(k.s)), lean: 0.35 * k.s, bodyY: 5 * k.s, legSpread: 2.6, sx: 1.1, sy: 0.84 });
        else if (act.phase === "active") Object.assign(P, { armF: lerp(-0.6, 1.35, easeOut(k.a)), elbowF: 0.2, wBlend: 1, wAngle: lerp(2.2, 0.55, easeOut(k.a)), lean: 0.65, bodyY: 5.4, legSpread: 2.8, sx: 1.22, sy: 0.82, cloak: -1 });
        else Object.assign(P, { armF: lerp(1.35, 0.5, easeInOut(k.r)), elbowF: 0.3, wBlend: 1, wAngle: lerp(0.55, -0.5, easeInOut(k.r)), lean: 0.5 * (1 - easeOut(k.r)), bodyY: 5.4 * (1 - easeInOut(k.r)), legSpread: lerp(2.8, 1.3, k.r), sy: 0.85 + 0.15 * k.r });
        P.armB = (P.armF || 0) - 0.5;
      },
    },
  };

  /* =====================================================================
     БОЕВОЙ ТОПОР
     ===================================================================== */
  function axePose(P, act, p, k) {
    if (act.def.kit) return;
    const nm = act.name, S = act.phase === "startup", A = act.phase === "active", T = act.phase === "travel", R = act.phase === "recovery";
    // тяжёлое восстановление: первые 55% — топор «застрял» в нижней точке, затем медленный подъём
    const stuck = R ? 1 - easeInOut(clamp((k.r - 0.55) / 0.45, 0, 1)) : 0;
    const shake = S ? Math.sin(k.s * 38) * 0.05 * k.s : 0;
    if (nm === "slash3" || nm === "airSpin" || nm === "riposte") {
      // размашистый круговой удар: топор тянет корпус за собой
      if (S) Object.assign(P, { armF: lerp(0.3, 2.6, easeOut(k.s)), elbowF: 0.2, wBlend: 1, wAngle: lerp(0, -2.3, easeOut(k.s)), lean: -0.3 * k.s, bodyY: 3.2 * k.s, legSpread: 2.2, sx: 1.06, sy: 0.92 });
      else if (A) Object.assign(P, { armF: 2.0 - 0.6 * k.a, elbowF: 0.1, wBlend: 1, wAngle: -2.3 + TAU * easeIn(k.a) * (nm === "riposte" ? 1.4 : 1), lean: 0.55, bodyY: 4, legSpread: 2.5, sx: 0.5 + 0.6 * Math.abs(Math.cos(PI * k.a)), sy: 0.88, cloak: -1.3, armB: 1.4 });
      else Object.assign(P, { armF: lerp(1.4, 0.7, easeInOut(k.r)), elbowF: 0.3, wBlend: 1, wAngle: lerp(0.9, 0.2, easeInOut(k.r)), lean: 0.45 * stuck + 0.05, bodyY: 4 * Math.max(stuck, 1 - easeOut(k.r)) , legSpread: lerp(2.5, 1.4, k.r), sy: 0.9 + 0.1 * k.r, headTilt: 0.15 * stuck });
      if (nm === "airSpin") P.tuck = 0.3;
      P.armB = P.armB == null ? (P.armF || 0) - 0.5 : P.armB;
      return;
    }
    if (act.def.kind === "dive") {
      if (S) Object.assign(P, { armF: 3.0, elbowF: 0, wBlend: 1, wAngle: -1.9, tuck: 0.3, lean: -0.2, sy: 1.1 });
      else Object.assign(P, { armF: 2.8, elbowF: 0, wBlend: 1, wAngle: 1.45, lean: 0.3, tuck: 0.55, sx: 0.9, sy: 1.18, cloak: 1 });
      P.armB = P.armF - 0.3;
      return;
    }
    if (nm === "dash" || nm === "pierce") {
      // боевой наскок: топор волочится сзади, удар — широкий горизонтальный
      if (S) Object.assign(P, { armF: lerp(0.3, -1.3, easeOut(k.s)), elbowF: 0.3, wBlend: 1, wAngle: lerp(0, 2.9, easeOut(k.s)), lean: -0.25, bodyY: 3 * k.s, legSpread: 2.2 });
      else if (T) Object.assign(P, { armF: -1.3, elbowF: 0.3, wBlend: 1, wAngle: 2.9, lean: 0.9, tuck: 0.2, bodyY: 3.4, legSpread: 2.5, sx: 1.22, sy: 0.84, cloak: -1.2 });
      else if (A) Object.assign(P, { armF: lerp(-1.3, 1.7, easeOut(k.a)), elbowF: 0.1, wBlend: 1, wAngle: lerp(2.9, -0.2, easeOut(k.a)), lean: 0.7, bodyY: 3.8, legSpread: 2.6, sx: 1.2, sy: 0.84, cloak: -1 });
      else Object.assign(P, { armF: lerp(1.7, 0.7, easeInOut(k.r)), elbowF: 0.3, wBlend: 1, wAngle: lerp(-0.2, 0.3, easeInOut(k.r)), lean: 0.35 * stuck, bodyY: 3.8 * Math.max(stuck, 1 - easeOut(k.r)), legSpread: lerp(2.6, 1.4, k.r) });
      P.armB = (P.armF || 0) - 0.5;
      return;
    }
    if (nm === "rise") {
      // тяжёлый подъёмный удар обухом снизу
      if (S) Object.assign(P, { armF: lerp(0.3, -0.7, easeOut(k.s)), elbowF: 0.3, wBlend: 1, wAngle: lerp(0, 2.4, easeOut(k.s)), lean: 0.4 * k.s, bodyY: 4.4 * k.s, legSpread: 2.4, sx: 1.14, sy: 0.84 });
      else if (A) Object.assign(P, { armF: lerp(-0.7, 3.0, easeOut(k.a)), elbowF: 0.1, wBlend: 1, wAngle: lerp(2.4, -1.4, easeOut(k.a)), lean: -0.22, bodyY: -1.2, legSpread: 1.5, sx: 0.9, sy: 1.15, tuck: p.onGround ? 0 : 0.3 });
      else Object.assign(P, { armF: lerp(3.0, 0.7, easeInOut(k.r)), elbowF: 0.3, wBlend: 1, wAngle: lerp(-1.4, 0.3, easeInOut(k.r)), lean: 0.1 * stuck, bodyY: 1.5 * stuck });
      P.armB = (P.armF || 0) - 0.4;
      return;
    }
    if (nm === "thrust" || nm === "flurry") {
      // «обухом»: плечо вперёд, топор плашмя, таран
      const rep = (act.def.hits || 1) > 1, u = rep ? (k.a * act.def.hits) % 1 : k.a;
      if (S) Object.assign(P, { armF: lerp(0.3, -0.4, easeOut(k.s)), elbowF: 1.0, wBlend: 1, wAngle: -0.15, lean: -0.2 * k.s, bodyY: 2.8 * k.s, legSpread: 2.2, sx: 1.06 });
      else if (A) Object.assign(P, { armF: lerp(0.9, 1.5, easeOut(rep ? u : k.a)), elbowF: 0, wBlend: 1, wAngle: -0.05, lean: 0.65, bodyY: 3.2, legSpread: 2.5, sx: 1.2, sy: 0.88, cloak: -0.8 });
      else Object.assign(P, { armF: lerp(1.5, 0.6, easeInOut(k.r)), elbowF: 0.2, wBlend: 1, wAngle: lerp(0, 0.3, k.r), lean: 0.4 * stuck, bodyY: 3.2 * Math.max(stuck * 0.6, 1 - easeOut(k.r)), legSpread: lerp(2.5, 1.4, k.r) });
      P.armB = (P.armF || 0) - 0.5;
      return;
    }
    // рубящие (slash1/2, cross, airSlash): замах высоко над головой, удар сверху вниз с приседом
    const side = nm === "slash2";             // второй удар — косой, с плеча
    const w0 = side ? -2.9 : -2.35, w1 = side ? 0.35 : 1.15;
    const a0 = side ? 2.2 : 3.0, a1 = side ? 1.5 : 1.2;
    const rep = (act.def.hits || 1) > 1, sub = Math.min((act.def.hits || 1) - 1, Math.floor(k.a * (act.def.hits || 1))), u = k.a * (act.def.hits || 1) - sub;
    if (S) Object.assign(P, { armF: lerp(0.3, a0, easeOut(k.s)) + shake, elbowF: 0.15, wBlend: 1, wAngle: lerp(0, w0, easeOut(k.s)), lean: -0.28 * k.s, bodyY: -0.8 * k.s, legSpread: 1.9 + 0.3 * k.s, sx: 1 - 0.04 * k.s, sy: 1 + 0.1 * k.s, headTilt: -0.12 * k.s });
    else if (T) Object.assign(P, { armF: a0, elbowF: 0.15, wBlend: 1, wAngle: w0, lean: 0.4, bodyY: 1, legSpread: 2.3 });
    else if (A) Object.assign(P, {
      armF: rep ? lerp(a0, a1, easeOut(sub % 2 ? 1 - u : u)) : lerp(a0, a1, easeIn(k.a * 1.1)), elbowF: 0.05, wBlend: 1, wAngle: rep ? lerp(w0, w1, easeOut(sub % 2 ? 1 - u : u)) : lerp(w0, w1, easeIn(k.a * 1.1)),
      lean: 0.6, bodyY: 4.6, legSpread: 2.6, sx: 1.2, sy: 0.82, cloak: -1.1, headTilt: 0.12,
    });
    else Object.assign(P, { armF: lerp(a1, 0.6, easeInOut(clamp((k.r - 0.5) / 0.5, 0, 1))), elbowF: 0.2, wBlend: 1, wAngle: lerp(w1, 0.3, easeInOut(clamp((k.r - 0.5) / 0.5, 0, 1))), lean: 0.55 * stuck + 0.05, bodyY: 4.6 * Math.max(stuck, 1 - easeOut(k.r)) + Math.sin(k.r * 40) * 0.3 * stuck, legSpread: lerp(2.6, 1.4, k.r), sx: 1.1 - 0.1 * (1 - stuck), sy: 0.85 + 0.15 * (1 - stuck), headTilt: 0.2 * stuck });
    P.armB = (P.armF || 0) - 0.4;
    if (!p.onGround) { P.tuck = 0.35; P.bodyY = Math.min(P.bodyY || 0, 2); }
  }

  const axeMoves = {
    // сильная доля + точный удар вплотную: топор вгоняется в землю, по полу бежит ударная волна
    axe_cleave: {
      kind: "custom", name: "Раскол земли", startup: 0.13, active: 0.1, recovery: 0.42, cancel: 0.36,
      dmg: 26, reach: 46, knock: 420, stun: 0.9, wave: 96,
      fx(g, p, act) {
        const cs = g.combat, def = act.def, d = act.dir, col = p.skin.accent;
        stamp(cs, "cleave");
        const ix = p.x + d * 30, iy = p.y;
        g.sfx("slam"); g.sfx("slash", 0.8);
        g.fx.slashArc(p.x + d * 4, p.y - 24, 34, d > 0 ? -1.9 : PI - 1.2 + 0.0, d > 0 ? 1.2 : PI + 1.9, col, 10, 0.22);
        g.fx.shockwave(ix, iy, col, def.wave * 2);
        g.fx.ring(ix, iy - 3, 5, def.wave * 0.7, "#ffffff", 0.3, 2.4);
        // трещины по полу в обе стороны
        g.fx.cut(ix, iy - 1, ix + def.wave, iy - 1, col, 3, 0.4); g.fx.cut(ix, iy - 1, ix - def.wave * 0.8, iy - 1, col, 3, 0.4);
        g.fx.cut(ix, iy - 1, ix + def.wave, iy - 1, "#ffffff", 1, 0.3);
        g.fx.sparks(ix, iy, 10, col, 300, -PI / 2, 1.5, 0.4);
        g.fx.dust(ix, iy, 10);
        g.camera.shake(0.4); g.camera.kick(0.03);
        // ударная волна: враги на земле рядом получают часть урона и подскакивают
        act.dmgK = 0.55;
        for (const e of g.enemies) {
          if (!e.targetable || act.hit.has(e.id) || Math.abs(e.y - p.y) > 26) continue;
          if (Math.abs(e.x - ix) > def.wave) continue;
          act.hit.add(e.id);
          cs._applyHit(e, act, sign(e.x - p.x) || d, e.x, e.centerY);
          if (e.alive && !e.executed && e.kind !== "brute") { e.vy = -150; e.onGround = false; }
        }
        act.dmgK = 1;
      },
      update(cs, p, act, dt, tA) {
        p.vx = act.phase === "active" ? 0 : damp(p.vx, 0, 12, dt);
        if (act.phase === "active") cs._meleeHits(p, act, false);       // прямой удар лезвием — полный урон
      },
      pose(P, act, p, k) {
        const stuck = act.phase === "recovery" ? 1 - easeInOut(clamp((k.r - 0.6) / 0.4, 0, 1)) : 0;
        if (act.phase === "startup") Object.assign(P, { armF: lerp(0.3, 3.05, easeOut(k.s)) + Math.sin(k.s * 45) * 0.04 * k.s, elbowF: 0.1, wBlend: 1, wAngle: lerp(0, -2.5, easeOut(k.s)), lean: -0.35 * k.s, bodyY: -1.2 * k.s, legSpread: 2.1, sy: 1 + 0.12 * k.s, sx: 0.96, headTilt: -0.18 * k.s });
        else if (act.phase === "active") Object.assign(P, { armF: lerp(3.05, 1.2, easeIn(k.a * 1.15)), elbowF: 0, wBlend: 1, wAngle: lerp(-2.5, 1.3, easeIn(k.a * 1.15)), lean: 0.7, bodyY: 5, legSpread: 2.7, sx: 1.2, sy: 0.8, cloak: -1.2, headTilt: 0.15 });
        else Object.assign(P, { armF: lerp(1.2, 0.5, easeInOut(clamp((k.r - 0.55) / 0.45, 0, 1))), elbowF: 0.15, wBlend: 1, wAngle: lerp(1.3, 0.25, easeInOut(clamp((k.r - 0.55) / 0.45, 0, 1))), lean: 0.6 * stuck, bodyY: 5 * Math.max(stuck, 1 - easeOut(k.r)) + Math.sin(k.r * 30) * 0.35 * stuck, legSpread: lerp(2.7, 1.4, k.r), sy: 0.82 + 0.18 * (1 - stuck), sx: 1.15 - 0.15 * (1 - stuck), headTilt: 0.25 * stuck });
        P.armB = (P.armF || 0) - 0.4;
      },
    },
    // точное нажатие по цели на средней дистанции: топор улетает вращающимся диском и возвращается
    axe_throw: {
      kind: "custom", name: "Бросок топора", startup: 0.12, active: 0.52, recovery: 0.18, cancel: 0.46,
      dmg: 14, knock: 230, stun: 0.5,
      fx(g, p, act) {
        stamp(g.combat, "axeThrow"); g.sfx("slash", 0.8); g.camera.kick(0.014);
        throwLaunch(g, p, act, { kind: "axe", speed: 900, r: 9 });
        const h = CharacterRenderer.handWorld(p, 10);
        g.fx.glow(h.x, h.y, 3, 20, "#ffffff", 0.12, 0.5);
      },
      update(cs, p, act, dt) { p.vx = damp(p.vx, 0, 14, dt); if (act.phase !== "startup") throwStep(cs, p, act, dt); },
      pose(P, act, p, k) {
        const fly = act.phase === "active" && !act.caught;
        if (act.phase === "startup") Object.assign(P, { armF: lerp(0.3, 2.7, easeOut(k.s)), elbowF: 0.2, wBlend: 1, wAngle: lerp(0, -2.3, easeOut(k.s)), lean: -0.4 * k.s, bodyY: 3 * k.s, legSpread: 2.2, sx: 0.98, headTilt: -0.15 * k.s });
        else if (act.phase === "active") Object.assign(P, { armF: fly ? 1.5 : 1.0, elbowF: 0, wBlend: 1, wAngle: 0, lean: 0.6, bodyY: 3.4, legSpread: 2.6, sx: 1.18, sy: 0.88, cloak: -0.9 });
        else Object.assign(P, { armF: lerp(1.2, 0.6, easeInOut(k.r)), elbowF: 0.3, wBlend: 1, wAngle: lerp(0.2, 0.3, k.r), lean: 0.3 * (1 - k.r), bodyY: 3.4 * (1 - easeInOut(k.r)), legSpread: lerp(2.6, 1.4, k.r) });
        P.armB = fly && act.phase === "active" ? -0.3 : (P.armF || 0) - 0.5;
        if (fly) p.weapon = "none";
      },
    },
  };

  /* =====================================================================
     ВЫБОР ПРИЁМОВ
     ===================================================================== */
  registerKit("spear", {
    moves: spearMoves,
    pose: spearPose,
    choose(cs, name, c) {
      if (c.air || !c.target) return;
      // Вращение древка: третий удар серии на сильной доле, если два предыдущих были в такт
      if (name === "slash3" && c.j.strong && c.good && cs.chain >= 2 && !c.j.offbeat) return "spear_whirl";
      // Бросок-возврат: точное нажатие по дальней цели вместо рывка (не чаще раза в 3 с)
      if (name === "dash" && c.j.rating === "perfect" && c.dx >= 80 && ready(cs, "spearThrow", 3)) return "spear_throw";
    },
    takedown(cs, kind, e) { return kind === "colossus" ? "spear_impale_big" : kind === "xcut" ? "spear_impale" : null; },
  });
  registerKit("glaive", {
    moves: glaiveMoves,
    pose: glaivePose,
    choose(cs, name, c) {
      if (c.air || !c.target) return;
      // Лунный круг: окружён (двое и более вплотную) + точное нажатие
      if (MELEE_NAMES.includes(name) && name !== "cross" && c.good && !c.j.offbeat && around(cs, 66).n >= 2 && ready(cs, "circle", 2.2)) return "glaive_circle";
      // Подсечка: нажатие на «и» после двух ударов серии (slash1, slash2) вместо «Шквала»; после одного удара «Шквал» остаётся
      if (name === "flurry" && cs.comboStep === 2 && ready(cs, "sweep", 0.8)) return "glaive_sweep";
    },
    takedown(cs, kind, e) { return kind === "colossus" ? "glaive_moon_big" : kind === "xcut" ? "glaive_moon" : null; },
  });
  registerKit("axe", {
    moves: axeMoves,
    pose: axePose,
    choose(cs, name, c) {
      if (c.air || !c.target) return;
      // Раскол земли: сильная доля + точный удар вплотную
      if (MELEE_NAMES.includes(name) && name !== "cross" && name !== "flurry" && c.j.strong && c.good && !c.j.offbeat && c.dx <= 36 && Math.abs(c.dy) < 40 && ready(cs, "cleave", 1.8)) return "axe_cleave";
      // Бросок топора: хороший удар по цели на средней дистанции вместо рывка
      if (name === "dash" && c.good && c.dx >= 70 && ready(cs, "axeThrow", 3)) return "axe_throw";
    },
    takedown(cs, kind, e) { return kind === "colossus" ? "axe_headsman_big" : kind === "xcut" ? "axe_headsman" : null; },
  });

  /* =====================================================================
     ДОБИВАНИЯ
     ===================================================================== */
  /** Общие заготовки сценария: враг на месте, герой на земле. */
  const stand = (cs, td) => { cs.game.player.y = td.py; };

  /* ---------- копьё: «ПРОНЗАНИЕ» ----------
     Герой раскручивает древко, берёт широкую стойку и одним выпадом прошивает врага. Короткая пауза на копье,
     рывок на себя — враг отлетает. Для громилы — три быстрых укола и один тяжёлый выпад с подъёмом. */
  function spearImpale(big) {
    const stabs = big ? [0.2, 0.3, 0.4] : [], tm = big ? 0.62 : 0.3, tf = big ? 0.86 : 0.56;
    return {
      name: big ? "КОПЬЁ ВО ТЬМЕ" : "ПРОНЗАНИЕ", dur: big ? 1.18 : 0.88, death: big ? "topple" : "shot",
      update(cs, td, api) {
        const g = cs.game, p = g.player, e = td.e, d = td.dir, t = api.t, cy = api.cy, col = api.col, low = api.low, life = api.life;
        const stop = clamp(e.x - d * (big ? 36 : 26) * Math.max(1, e.scale * 0.8), 40, WORLD.w - 40);
        // выход в позицию: громила — подход и уколы с места, затем шаг в последний выпад; остальные — рывок после раскрутки
        if (big) p.x = lerp(td.px, stop, easeInOut(ph3(t, 0, 0.17))) + d * 8 * easeOut(ph3(t, 0.5, 0.6)) - (t > tf ? d * 6 * ph3(t, tf, tf + 0.2) : 0);
        else p.x = (t < 0.2 ? td.px : lerp(td.px, stop, easeIn(ph3(t, 0.2, 0.28)))) - (t > tf ? d * 6 * ph3(t, tf, tf + 0.2) : 0);
        p.facing = d;
        // короткие уколы громиле (кружок малого размера, без вспышек на весь экран)
        stabs.forEach((st, i) => api.once("stab" + i, st, () => {
          const yy = cy + (i - 1) * 9 * e.scale, x0 = p.x + d * 10;
          g.fx.cut(x0, yy, e.x + d * 22, yy, col, 2.6, life(0.3));
          g.fx.cut(x0, yy, e.x + d * 22, yy, "#ffffff", 1, life(0.22));
          g.fx.sparks(e.x - d * 8, yy, 3, api.ec, 150, d > 0 ? Math.PI : 0, 0.9, 0.2);
          g.sfx("hit", 0.9 + 0.1 * i); e.flash = 0.5; e.hitKick = 1; g.camera.shake(0.08);
        }));
        api.once("streak", tm - 0.07, () => api.streak(p.x, stop, p.y - 20));
        api.once("pierce", tm, () => {
          // сквозной росчерк по линии копья: от кисти насквозь, дальше врага
          const y0 = p.y - 20, x1 = e.x + d * 76;
          g.fx.cut(p.x + d * 8, y0, x1, cy, col, 4, life(0.55));
          g.fx.cut(p.x + d * 8, y0, x1, cy, "#ffffff", 1.4, life(0.4));
          if (!low) g.fx.glow(e.x, cy, 5, 22, col, life(0.22), 0.35);
          g.fx.sparks(e.x + d * 18, cy, 5, api.ec, 210, d > 0 ? 0 : Math.PI, 0.9, 0.25);
          g.sfx("dash"); g.sfx("hit", 1.3); e.flash = 0.6; e.hitKick = 1; g.camera.shake(0.2); g.hitstop(0.06);
        });
        // враг висит на копье: приподнят и подрагивает; громила оседает
        const hang = ph3(t, tm, tf);
        if (t >= tm && t < tf) {
          e.y = td.ey - (big ? 5 : 9) * easeOut(hang) + Math.sin(t * 60) * 0.7;
          e.x = td.ex + d * 3 * easeOut(hang);
          e.tdPose = { lean: -0.5 * easeOut(hang), bodyY: 1 + 3 * hang, headTilt: -0.35, tuck: 0.4, sy: 0.96 };
        } else if (t < tm) e.tdPose = big ? { lean: -0.12 * ph3(t, 0.2, tm), bodyY: 1.5 * ph3(t, 0.2, tm), sy: 1 } : null;
        api.once("heave", tf, () => {
          // рывок на себя и вверх: росчерк дугой, враг срывается с копья
          g.fx.slashArc(p.x + d * 6, p.y - 22, 32, d > 0 ? -1.4 : PI - 0.2, d > 0 ? 0.2 : PI + 1.4, col, 5, life(0.28));
          api.finish();
          e.y = td.ey;
          g.fx.shockwave(e.x, td.ey, col, big ? 160 : 100);
          if (big) g.fx.dust(e.x, td.ey, low ? 6 : 12, "#2a2633");
        });
      },
      pose(cs, p, td) {
        const t = td.t, tm = big ? 0.62 : 0.3, tf = big ? 0.86 : 0.56, lunge = 0.2;
        const hold = { armF: 1.5, elbowF: 0, wBlend: 1, wAngle: 0, lean: 0.62, bodyY: 3.2, legSpread: 2.6, sx: 1.18, sy: 0.88, cloak: -0.9, armB: 0.9, tuck: 0 };
        if (big && t < 0.55) {
          // три быстрых укола: рука вперёд-назад, затем отвод для последнего выпада
          let kick = 0; for (const st of [0.2, 0.3, 0.4]) { const s = t - st; if (s >= -0.03 && s < 0.08) kick = Math.max(kick, 1 - Math.abs(s - 0.02) / 0.06); }
          const dr = ph3(t, 0.44, 0.55), k = ph3(t, 0, 0.14);
          return { armF: lerp(0.4 + (0.1 * k), -0.55, dr) + kick * 1.0, elbowF: lerp(0.4 * (1 - kick), 1.1, dr), wBlend: 1, wAngle: lerp(-0.05, 0.05, dr), lean: 0.12 + kick * 0.38 - 0.35 * dr, bodyY: 2.6 + 0.6 * dr, legSpread: 2.2 + 0.3 * dr, sx: 1 + 0.1 * kick, armB: 0.5 + kick * 0.8 - 1.2 * dr };
        }
        if (t < lunge) {
          // раскрутка древка перед выпадом, затем отвод руки
          const spin = ph3(t, 0.02, lunge * 0.62), draw = ph3(t, lunge * 0.62, lunge);
          return { armF: lerp(1.2, -0.55, easeOut(draw)), elbowF: lerp(0.3, 1.1, draw), wBlend: 1, wAngle: spin < 1 ? -0.3 + TAU * easeInOut(spin) : lerp(-0.3, 0.05, draw), lean: -0.22 * draw, bodyY: 2.8 * draw, legSpread: 1.9 + 0.5 * draw, sx: 1.03, armB: lerp(0.7, -0.9, draw), cloak: -0.4 * draw };
        }
        if (t < tm + 0.02) return Object.assign({}, hold, { lean: lerp(0.3, 0.8, ph3(t, lunge, tm)) });
        if (t < tf) return Object.assign({}, hold, { armF: 1.5 + Math.sin(t * 50) * 0.02, bodyY: 3.2 + Math.sin(t * 60) * 0.25 });
        // рывок на себя и вращение копья над головой, затем упор тупым концом в землю
        const k = ph3(t, tf, tf + 0.16), r = ph3(t, tf + 0.16, td.dur);
        if (k < 1) return { armF: lerp(1.5, 2.5, easeOut(k)), elbowF: 0.1, wBlend: 1, wAngle: lerp(0, -1.5, easeOut(k)), lean: lerp(0.5, -0.25, k), bodyY: lerp(3.2, -0.5, k), legSpread: 2.2, sx: 0.94, sy: 1.1, armB: 2.0, cloak: 0.8 };
        return { armF: lerp(2.5, 0.6, easeInOut(r)), elbowF: 0.2, wBlend: 1, wAngle: lerp(-1.5, PI / 2, easeInOut(ph3(r, 0.1, 0.7))) + 0.0, lean: lerp(-0.25, 0, r), bodyY: lerp(-0.5, 0, r), legSpread: lerp(2.2, 1.2, r), armB: lerp(2.0, 0.4, r), cloak: 0.5 * (1 - r) };
      },
    };
  }

  /* ---------- глефа: «ЛУННЫЙ СЕРП» ----------
     Герой подходит и разворачивается через плечо; глефа чертит вокруг врага кольцо из трёх дуг. Кольцо схлопывается,
     и косой разрез разваливает врага на половины. Для громилы — двойное кольцо. */
  function glaiveMoon(big) {
    const arcT = big ? [0.3, 0.37, 0.44, 0.52, 0.59, 0.66] : [0.27, 0.35, 0.43], tc = big ? 0.8 : 0.52;
    return {
      name: big ? "ЗАТМЕНИЕ" : "ЛУННЫЙ СЕРП", dur: big ? 1.28 : 0.98, death: big ? "topple" : "split",
      update(cs, td, api) {
        const g = cs.game, p = g.player, e = td.e, d = td.dir, t = api.t, cy = api.cy, col = api.col, low = api.low, life = api.life;
        const R = (big ? 40 : 32) * Math.max(1, e.scale * 0.85), stand = clamp(e.x - d * (R + 12), 40, WORLD.w - 40);
        p.y = td.py;
        // шаг к врагу — тяжёлый, с замедлением; после удара небольшой откат
        p.x = lerp(td.px, stand, easeInOut(ph3(t, 0.02, 0.26)));
        if (t > tc + 0.12) p.x = lerp(stand, clamp(stand - d * 14, 40, WORLD.w - 40), easeOut(ph3(t, tc + 0.12, tc + 0.4)));
        p.facing = d;
        // кольцо вокруг врага: каждая дуга охватывает 125°, шагая по окружности
        arcT.forEach((at, i) => api.once("arc" + i, at, () => {
          const outer = big && i >= 3, rr = outer ? R * 1.28 : R, a0 = (i % 3) * 2.2 - 1.2 + (outer ? 0.5 : 0);
          g.fx.slashArc(e.x, cy, rr, a0, a0 + 2.3, col, outer ? 5 : 6, life(0.7));
          g.fx.slashArc(e.x, cy, rr - 3, a0 + 0.2, a0 + 2.1, "#ffffff", 1.4, life(0.5));
          g.sfx("slash", 1.1 + 0.12 * i);
          g.camera.shake(0.08); e.flash = 0.35;
          if (big) e.hitKick = 1;
        }));
        api.once("collapse", tc - 0.06, () => { g.fx.ring(e.x, cy, 2, R * 1.5, col, life(0.28), 2.4); });
        api.once("cut", tc, () => {
          // косой разрез: от верхнего заднего края кольца к нижнему переднему
          const x0 = e.x - d * R * 1.15, y0 = cy - R * 1.0, x1 = e.x + d * R * 1.15, y1 = cy + R * 1.0;
          g.fx.cut(x0, y0, x1, y1, col, 4.4, life(0.6));
          g.fx.cut(x0, y0, x1, y1, "#ffffff", 1.5, life(0.45));
          if (!low) { g.fx.glow(e.x, cy, 6, 28 + (big ? 10 : 0), "#ffffff", life(0.24), 0.32); g.fx.glow(e.x, cy, 4, 36, col, life(0.3), 0.25); }
          g.fx.sparks(e.x, cy, 5, col, 210, null, PI, 0.25);
          g.sfx("dash"); g.sfx("hit", 1.4); e.flash = 0.6; g.camera.shake(0.24); g.hitstop(0.06);
          api.finish();
          if (!big) e.splitAng = d * 0.9;
        });
        // враг в кольце: замирает, громила шатается
        if (t < tc) e.tdPose = { lean: -0.12 * ph3(t, 0.3, tc), bodyY: (big ? 2.5 : 1) * ph3(t, 0.3, tc), headTilt: -0.18 * ph3(t, 0.3, tc), sy: 1 };
        else e.tdPose = null;
      },
      pose(cs, p, td) {
        const t = td.t, tc = big ? 0.8 : 0.52, a0 = big ? 0.3 : 0.27, a1 = tc - 0.04;
        // 0–0.26: тяжёлый шаг, глефа волочится позади; затем оборот через плечо; после разреза — упор древком и медленный вдох
        if (t < a0 - 0.04) {
          const k = easeInOut(ph3(t, 0, a0 - 0.04));
          return { armF: lerp(0.4, -1.55, k), elbowF: 0.3, wBlend: 1, wAngle: lerp(0, PI + 0.25, k), lean: -0.25 * k, bodyY: 3.2 * k, legSpread: 2.2, sx: 1 - 0.18 * k, cloak: 1.2 * k, headTilt: 0.1 * k, armB: 1.0 };
        }
        if (t < a1) {
          const k = easeInOut(ph3(t, a0 - 0.04, a1)), turns = big ? 2 : 1;
          return { armF: lerp(-1.55, 2.0, easeInOut(k)), elbowF: 0.1, wBlend: 1, wAngle: PI + 0.25 + TAU * turns * k, lean: 0.12, bodyY: 3, legSpread: 2.4, sx: 0.4 + 0.65 * Math.abs(Math.cos(PI * k * turns * 2)), sy: 0.95, cloak: -1.4, armB: 1.0, spin: 0 };
        }
        if (t < tc + 0.16) return { armF: lerp(2.0, 1.4, ph3(t, a1, tc + 0.16)), elbowF: 0, wBlend: 1, wAngle: lerp(0.5, 0.9, ph3(t, tc, tc + 0.16)), lean: 0.65, bodyY: 3.6, legSpread: 2.6, sx: 1.2, sy: 0.86, cloak: -1.2, armB: 1.2 };
        const r = ph3(t, tc + 0.16, td.dur);
        return { armF: lerp(1.4, 0.5, easeInOut(r)), elbowF: 0.3, wBlend: 1, wAngle: lerp(0.9, -0.5, easeInOut(r)), lean: lerp(0.6, 0, easeInOut(r)), bodyY: lerp(3.6, 0, easeInOut(r)), legSpread: lerp(2.6, 1.2, r), sx: 1.15 - 0.15 * r, cloak: -0.6 * (1 - r), headTilt: -0.14 * Math.sin(r * PI), armB: lerp(1.2, -0.25, r) };
      },
    };
  }

  /* ---------- топор: «ПАЛАЧ» ----------
     Шаг, топор медленно поднимается над головой и замирает (камера наезжает); один рубящий удар сверху вниз
     раскалывает врага пополам и вгоняет топор в землю. Герой долго и тяжело вытягивает его.
     Громила: два удара — первый ставит на колено, второй добивает. */
  function axeHeadsman(big) {
    const chops = big ? [0.56, 0.96] : [0.44], raiseEnd = big ? 0.46 : 0.38, tf = chops[chops.length - 1];
    return {
      name: big ? "ДВА УДАРА ПАЛАЧА" : "ПАЛАЧ", dur: big ? 1.55 : 1.0, death: big ? "topple" : "split",
      update(cs, td, api) {
        const g = cs.game, p = g.player, e = td.e, d = td.dir, t = api.t, cy = api.cy, col = api.col, low = api.low, life = api.life;
        const stand = clamp(e.x - d * (big ? 40 : 30) * Math.max(1, e.scale * 0.8), 40, WORLD.w - 40);
        p.y = td.py;
        p.x = lerp(td.px, stand, easeInOut(ph3(t, 0.0, 0.2)));
        p.facing = d;
        // напряжение: топор поднят, камера медленно наезжает на врага
        if (t > 0.18 && t < chops[0]) g.camera.retarget(lerp(p.x, e.x, 0.65), e.centerY - 8, null);
        api.once("raise", 0.24, () => { g.sfx("slash", 0.6); g.fx.ring(p.x, p.y - 36, 3, 18, "#ffffff", life(0.3), 1.2); });
        chops.forEach((ct, i) => {
          const last = i === chops.length - 1;
          api.once("chop" + i, ct, () => {
            const ix = e.x - d * 4, top = e.y - e.h * e.scale - 6;
            // вертикальный разрез по врагу и росчерк до самой земли
            g.fx.cut(ix, top, ix, td.ey + 2, col, last ? 4.8 : 3.6, life(0.6));
            g.fx.cut(ix, top, ix, td.ey + 2, "#ffffff", last ? 1.7 : 1.3, life(0.45));
            if (!low) g.fx.glow(ix, cy, 5, last ? 34 : 24, "#ffffff", life(0.22), 0.3);
            // трещины по полу и пыль у лезвия
            const w = last ? 120 : 70;
            g.fx.cut(ix, td.ey - 1, ix + w, td.ey - 1, col, 3, life(0.45)); g.fx.cut(ix, td.ey - 1, ix - w, td.ey - 1, col, 3, life(0.45));
            g.fx.shockwave(ix, td.ey, col, last ? 200 : 120);
            g.fx.dust(ix, td.ey, low ? 4 : last ? 12 : 7);
            g.fx.sparks(ix, cy, 5, col, 230, null, PI, 0.28);
            g.sfx("slam"); g.sfx("hit", last ? 1.5 : 1.2); e.flash = 0.6; e.hitKick = 1;
            g.camera.shake(last ? 0.5 : 0.3); g.hitstop(last ? 0.11 : 0.07);
            if (last) { api.finish(); if (!big) e.splitAng = d * (PI / 2 - 0.12); }
          });
        });
        // громила после первого удара оседает на колено
        if (big) {
          const sag = ph3(t, chops[0], chops[0] + 0.22) * (t < chops[1] ? 1 : 0);
          e.tdPose = t < chops[0] ? { lean: -0.05, bodyY: 0.8 } : t < chops[1] ? { lean: -0.2 - 0.2 * sag, bodyY: 1.5 + 4.5 * sag, sy: 1 - 0.12 * sag, headTilt: -0.35 * sag } : null;
        } else e.tdPose = t < chops[0] ? { lean: -0.08 * ph3(t, 0.2, chops[0]), bodyY: 0.8 * ph3(t, 0.2, chops[0]) } : null;
        // разрез расходится: половинки чуть разъезжаются сами (в _finishTakedown splitAng, смерть "split")
        void tf;
      },
      pose(cs, p, td) {
        const t = td.t;
        const c0 = chops[0];
        const raise = ph3(t, 0.1, raiseEnd);
        const chopPose = (c, big2) => {
          const s = t - c;       // время после удара
          const k = easeOut(clamp(s / 0.09, 0, 1));
          return { armF: lerp(3.05, 1.2, k), elbowF: 0, wBlend: 1, wAngle: lerp(-2.5, 1.3, k), lean: lerp(-0.3, 0.72, k), bodyY: lerp(-1, 5.2, k), legSpread: 2.7, sx: lerp(0.98, 1.22, k), sy: lerp(1.1, 0.8, k), cloak: -1.2 * k, headTilt: 0.15 * k, armB: 2.7 - 1.5 * k };
        };
        const risePose = (a, b) => { // медленный подъём с подрагиванием, замирание в верхней точке
          const k = easeInOut(ph3(t, a, b));
          return { armF: lerp(0.4, 3.05, k) + Math.sin(t * 46) * 0.04 * k, elbowF: 0.1, wBlend: 1, wAngle: lerp(0, -2.5, k), lean: -0.3 * k, bodyY: -1.2 * k, legSpread: 2.1 + 0.3 * k, sx: 0.96, sy: 1 + 0.12 * k, headTilt: -0.2 * k, armB: 2.7 * k, cloak: 0.5 * k };
        };
        // удары
        for (let i = chops.length - 1; i >= 0; i--) {
          const c = chops[i];
          if (t >= c - 0.02) {
            const last = i === chops.length - 1;
            const s = t - c;
            if (s < 0.14) return chopPose(c);
            if (!last) {
              // между ударами громилы: топор вырывается и поднимается снова
              const k = ph3(t, c + 0.14, chops[i + 1] - 0.07);
              return { armF: lerp(1.2, 3.05, easeInOut(k)), elbowF: 0.1, wBlend: 1, wAngle: lerp(1.3, -2.5, easeInOut(k)), lean: lerp(0.72, -0.3, easeInOut(k)), bodyY: lerp(5.2, -1.2, easeInOut(k)) + Math.sin(k * 30) * 0.4 * (1 - k), legSpread: 2.7, sx: lerp(1.2, 0.96, k), sy: lerp(0.8, 1.1, k), headTilt: lerp(0.15, -0.2, k), armB: lerp(1.5, 2.7, k), cloak: 0.4 * k };
            }
            // тяжёлое восстановление: топор застрял в земле, герой вытягивает его с усилием
            const r = ph3(t, c + 0.14, td.dur), strain = ph3(r, 0.25, 1);
            return { armF: lerp(1.2, 0.6, easeInOut(strain)), elbowF: 0.2, wBlend: 1, wAngle: lerp(1.3, 0.3, easeInOut(strain)), lean: lerp(0.7, 0.05, easeInOut(strain)) + Math.sin(r * 28) * 0.03 * (1 - strain), bodyY: lerp(5.2, 0, easeInOut(strain)) + Math.sin(r * 24) * 0.4 * (1 - strain), legSpread: lerp(2.7, 1.3, strain), sx: 1.18 - 0.18 * strain, sy: 0.82 + 0.18 * strain, headTilt: 0.22 * (1 - strain), armB: lerp(1.5, -0.25, strain), cloak: -0.5 * (1 - strain) };
          }
        }
        if (t < 0.1) return { armF: 0.4, elbowF: 0.3, wBlend: 1, wAngle: 0, lean: 0.1 * ph3(t, 0, 0.1), bodyY: 0.5 * ph3(t, 0, 0.1), legSpread: 1.8 };
        return risePose(0.1, raiseEnd);
      },
    };
  }

  registerTakedown("spear_impale", spearImpale(false));
  registerTakedown("spear_impale_big", spearImpale(true));
  registerTakedown("glaive_moon", glaiveMoon(false));
  registerTakedown("glaive_moon_big", glaiveMoon(true));
  registerTakedown("axe_headsman", axeHeadsman(false));
  registerTakedown("axe_headsman_big", axeHeadsman(true));
  void stand;
}
