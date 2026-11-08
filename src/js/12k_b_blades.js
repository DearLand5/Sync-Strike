/* =====================================================================
   Наборы клинков (12d_kits): kusari «Цепной серп», katana «Багровая катана», dagger «Теневой кинжал».
   У каждого оружия свои:
     • анимации ВСЕХ атак (kit.pose): кусаригама — раскрутка цепи над головой и хлёст, катана — стойка иай (рука у рукояти),
       выхватывающие разрезы, стряхивание крови (тибури) и возврат в ножны, кинжал — обратный хват, низкая стойка, короткие
       уколы и перехват клинка;
     • две комбинации (kit.moves + kit.choose), условие — в ритме:
         Цепной захват (kusariGrab)  — точное нажатие по цели на средней дистанции (не ближний бой): цепь притягивает врага;
         Вихрь цепи (kusariWhirl)    — сильная доля при точном нажатии вплотную (место подброса): цепь вращается вокруг, втягивает и бьёт всех;
         Иай (katanaIai)             — сильная доля после паузы (≥ 1,1 доли без ударов): рывок сквозь цель, «щелчок» ножен на следующей доле — враг рассечён;
         Танец лепестков (katanaPetals) — сильная доля в потоке ударов вплотную: 4 разреза на четвертях доли;
         Теневой шаг (daggerStep)    — точное (perfect) нажатие на средней дистанции: исчезает и бьёт со спины;
         Веер ножей (daggerKnives)   — хорошее нажатие издалека: три метательных ножа веером;
     • своё добивание на каждое оружие (рассечение — на земле; в воздухе и громила — встроенные sky/colossus):
         katanaIai «ОДИН ВЗМАХ» (проход, пауза, щелчок ножен — враг распадается), kusariCoil «ЦЕПНЫЕ ОКОВЫ» (цепь, рывок к себе, удар о землю),
         daggerFlurry «ТЕНЕВАЯ ПЛЯСКА» (серия ударов с разных сторон).
   Все побочные состояния приёмов хранятся в act (не в CombatSystem), всё в блоке {} — имена локальны.
   ===================================================================== */
{
  const wrapPi = a => a - TAU * Math.round(a / TAU);
  const period = cs => { const c = cs.game.clock; return c.map ? c.period : 0.5; };
  /** Опорный угол клинка на весь приём: ближайшее к текущему представление угла w0 (иначе половина оборота уходит «не в ту сторону»). */
  const baseAng = (act, p, w0, key = "kb") => {
    if (act[key] == null) { const cur = p.anim ? p.anim.pose.wAngle || 0 : 0; act[key] = cur + wrapPi(w0 - cur); }
    return act[key];
  };
  /** Имя базового приёма для таблицы поз (воздушные и сквозные — как земные). */
  const BASE = { airSlash: "slash1", dash: "thrust", pierce: "thrust", flurry: "thrust", riposte: "slash3", kusariWhirl: "slash3", katanaPetals: "slash1" };
  const SKIP = { dive: 1, meteor: 1, airSpin: 1 };
  /** Общий ход: номер удара в многоударном приёме и ход внутри него. */
  const subOf = (act, k) => { const h = act.def.hits || 1, s = Math.min(h - 1, Math.floor(k.a * h)); return { h, s, u: k.a * h - s }; };
  const ground = p => p.onGround !== false;

  /* ---------- кусаригама ---------- */
  // w0 — угол цепи в замахе, w1 — в конце взмаха (0 — вперёд, −π/2 — вверх, π/2 — вниз); a0/a1 — угол руки
  const KUS = {
    slash1: { w0: -2.2, w1: 0.55, a0: 2.7, a1: 1.5 },
    slash2: { w0: 2.5, w1: -0.55, a0: 0.1, a1: 1.8 },
    slash3: { w0: -1.6, w1: -1.6 + TAU * 1.5, a0: 2.5, a1: 1.8, spin: true },
    thrust: { w0: -0.35, w1: 0.05, a0: -0.2, a1: 1.57, straight: true },
    rise:   { w0: 1.3, w1: -2.6, a0: 0.3, a1: 2.9 },
    cross:  { w0: -2.0, w1: 0.6, a0: 2.5, a1: 1.5 },
  };
  const kusariPose = (P, act, p, k) => {
    const nm = BASE[act.name] || act.name;
    if (SKIP[nm]) return;
    const S = KUS[nm] || KUS.slash1, ph = act.phase, g = ground(p), { h, s, u } = subOf(act, k);
    const kb = baseAng(act, p, S.w0);
    let w = S.w0, arm = S.a0, ext = 1;
    if (ph === "startup") {
      // раскрутка цепи над головой: оборот-полтора, к концу подготовки цепь встаёт в угол замаха
      const e = easeOut(k.s);
      arm = lerp(1.0, S.a0, e);
      w = S.w0 - (S.straight ? 0.6 : TAU * 1.5) * (1 - e);
      ext = 0.4 + 0.25 * e;
      Object.assign(P, { lean: -0.14 * k.s, armB: lerp(-0.3, -1.3, e), elbowF: 0.25 });
      if (g) Object.assign(P, { bodyY: 0.5 + 1.8 * e, legSpread: 1.3 + 0.5 * e });
    } else if (ph === "travel") {
      w = S.w0; arm = S.a0; ext = 0.6;
    } else if (ph === "active") {
      let q = easeOut(k.a), a0 = S.w0, a1 = S.w1;
      if (h > 1 && !S.spin && !S.straight) { q = easeOut(u); if (s % 2) { a0 = S.w1; a1 = S.w0; } }     // «Крест»: туда и обратно
      w = lerp(a0, a1, q);
      arm = lerp(s % 2 && h > 1 ? S.a1 : S.a0, s % 2 && h > 1 ? S.a0 : S.a1, q);
      if (S.straight && h > 1) { ext = 0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, u * 1.5)); arm = 1.57; w = lerp(-0.25, 0.1, u); }
      P.armB = lerp(-1.3, 0.6, q);       // вторая рука с серпом идёт навстречу цепи
      P.elbowF = 0.1;
      if (g) Object.assign(P, { legSpread: 1.8, bodyY: 2 });
    } else {
      // втягивание цепи: рука опускается, цепь змеёй стекает вниз, серп возвращается в ладонь
      const e = easeInOut(k.r), w1 = S.w1;
      w = lerp(w1, w1 + wrapPi(1.25 - w1), e);
      arm = lerp(S.a1, 0.6, e);
      ext = 1 - e;
      P.armB = lerp(0.6, -0.4, e);
    }
    // относительные углы: kb — представление w0, ближайшее к текущему углу
    Object.assign(P, { armF: arm, wBlend: 1, wAngle: kb + (w - S.w0) });
    p.wExt = ext;
  };

  /* ---------- катана ---------- */
  const KAT_REST = 3.0;      // клинок позади и чуть вниз: рука на рукояти у бедра
  // w0/w1 — угол клинка, a0/a1 и e0/e1 — рука и локоть в начале и конце удара
  const KAT_TIB = 0.55;       // угол клинка при стряхивании крови (вниз-вперёд, не ниже пола)
  const KAT = {
    slash1: { w0: KAT_REST, w1: -0.55, a0: 0.45, a1: 1.55, e0: 0.95, e1: 0.05 },          // выхватывающий разрез снизу вперёд-вверх
    slash2: { w0: -2.4, w1: 0.75, a0: 2.8, a1: 1.45, e0: 0.2, e1: 0.05 },                  // кэса: сверху наискось вниз
    slash3: { w0: KAT_REST, w1: KAT_REST - TAU, a0: 1.4, a1: 1.6, e0: 0.4, e1: 0.05, spin: true },   // круговой разрез
    thrust: { w0: 0.0, w1: 0.0, a0: -0.5, a1: 1.57, e0: 1.6, e1: 0.0, flat: true },        // хира-дзуки: клинок плашмя
    rise:   { w0: 2.6, w1: -2.5, a0: 0.3, a1: 2.8, e0: 0.5, e1: 0.1 },
    cross:  { w0: KAT_REST, w1: -0.5, a0: 0.45, a1: 1.55, e0: 0.95, e1: 0.05 },
  };
  const katanaPose = (P, act, p, k) => {
    const nm = BASE[act.name] || act.name;
    if (SKIP[nm]) return;
    const S = KAT[nm] || KAT.slash1, ph = act.phase, g = ground(p), { h, s, u } = subOf(act, k);
    const kb = baseAng(act, p, S.w0);
    let w = S.w0, arm = S.a0, elb = S.e0;
    if (ph === "startup" || ph === "travel") {
      // иай: низкая стойка, рука на рукояти, клинок в ножнах позади; к удару — напряжение (лёгкая дрожь)
      const e = easeOut(ph === "travel" ? 1 : k.s);
      w = lerp(KAT_REST, S.w0, e) + (S.flat ? 0 : 0);
      arm = lerp(0.45, S.a0, e); elb = lerp(0.95, S.e0, e);
      Object.assign(P, { lean: -0.1 - 0.12 * k.s, armB: 0.55 - 0.9 * k.s, cloak: -0.4 });
      if (g) Object.assign(P, { bodyY: 1 + 2.4 * e + 0.3 * Math.sin(act.t * 70) * k.s, sy: 1 - 0.08 * e, sx: 1 + 0.06 * e, legSpread: 1.9 });
    } else if (ph === "active") {
      let q = easeOut(k.a), a0 = S.w0, a1 = S.w1, r0 = S.a0, r1 = S.a1, f0 = S.e0, f1 = S.e1;
      if (h > 1 && !S.spin && !S.flat) { q = easeOut(u); if (s % 2) { a0 = S.w1; a1 = S.w0 + (nm === "slash1" ? -2.4 - KAT_REST : 0); r0 = S.a1; r1 = 2.6; f0 = S.e1; f1 = 0.2; } }
      w = lerp(a0, a1, q); arm = lerp(r0, r1, q); elb = lerp(f0, f1, q);
      if (S.flat && h > 1) { arm = 1.57; elb = 0; }
      Object.assign(P, { armB: -1.35 + 0.3 * q, cloak: -1.1 });         // левая рука резко отводит ножны назад
      if (g) Object.assign(P, { legSpread: 1.95, bodyY: 2.6, sx: 1.14, sy: 0.9 });
      P.lean = 0.5;
    } else {
      // тибури: клинок стряхивает кровь вниз-вперёд, затем плавный возврат в ножны (ното)
      const f = Math.min(1, k.r / 0.45), n = Math.max(0, (k.r - 0.45) / 0.55), w1 = S.w1;
      if (k.r < 0.45) {
        const shake = Math.sin(k.r * TAU * 3.5) * 0.22 * (1 - f);
        w = lerp(w1, w1 + wrapPi(KAT_TIB - w1), easeOut(f)) + shake;
        arm = lerp(S.a1, 1.15, easeOut(f)); elb = lerp(S.e1, 0.15, f);
        Object.assign(P, { lean: lerp(0.45, 0.25, f), armB: lerp(-1.2, -0.5, f) });
      } else {
        const wr = w1 + wrapPi(KAT_TIB - w1);
        w = lerp(wr, wr + wrapPi(KAT_REST - wr), easeInOut(n));
        arm = lerp(1.15, 0.45, easeInOut(n)); elb = lerp(0.15, 0.95, easeInOut(n));
        Object.assign(P, { lean: lerp(0.25, 0.04, n), armB: lerp(-0.5, 0.55, n) });
      }
      if (g) Object.assign(P, { bodyY: lerp(2.2, 0.6, easeInOut(k.r)), legSpread: lerp(1.9, 1.3, k.r) });
    }
    Object.assign(P, { armF: arm, elbowF: elb, wBlend: 1, wAngle: kb + (w - S.w0) });
  };

  /* ---------- кинжал ---------- */
  const DAG_REST = 2.2;       // обратный хват: острие вниз-назад вдоль предплечья
  const DAG = {
    slash1: { w0: DAG_REST, w1: -0.3, a0: -0.15, a1: 1.5, e0: 1.4, e1: 0.1 },
    slash2: { w0: -0.9, w1: 2.4, a0: 1.9, a1: 0.7, e0: 0.3, e1: 0.7 },
    slash3: { w0: DAG_REST, w1: DAG_REST - TAU, a0: 1.2, a1: 1.4, e0: 0.6, e1: 0.3, spin: true },
    thrust: { w0: DAG_REST, w1: 0.05, a0: 0.2, a1: 1.57, e0: 1.3, e1: 0.0, stab: true },
    rise:   { w0: 2.5, w1: -2.3, a0: 0.5, a1: 2.7, e0: 0.6, e1: 0.1 },
    cross:  { w0: DAG_REST, w1: -0.3, a0: -0.15, a1: 1.5, e0: 1.4, e1: 0.1 },
  };
  const daggerPose = (P, act, p, k) => {
    const nm = BASE[act.name] || act.name;
    if (SKIP[nm]) return;
    const S = DAG[nm] || DAG.slash1, ph = act.phase, g = ground(p), { h, s, u } = subOf(act, k);
    const kb = baseAng(act, p, S.w0);
    let w = S.w0, arm = S.a0, elb = S.e0;
    // низкая подвижная стойка: корпус присел, ноги пружинят, свободная рука впереди как защита
    if (g) Object.assign(P, { bodyY: 2.0 + 0.35 * Math.sin(act.t * 16), legSpread: 1.6 });
    if (ph === "startup" || ph === "travel") {
      const e = easeOut(ph === "travel" ? 1 : k.s);
      w = S.w0; arm = lerp(0.85, S.a0, e); elb = lerp(1.0, S.e0, e);
      Object.assign(P, { lean: 0.1 - 0.2 * e, armB: lerp(1.0, 1.35, e) });
    } else if (ph === "active") {
      let q = easeOut(k.a), a0 = S.w0, a1 = S.w1, r0 = S.a0, r1 = S.a1;
      if (h > 1 && !S.spin) {       // серия коротких уколов: рука качается туда-обратно, острие каждый раз вперёд
        q = easeOut(Math.min(1, u * 1.4)); a0 = s % 2 ? 0.45 : S.w0; a1 = 0.0; r0 = 0.9; r1 = 1.57;
      }
      w = lerp(a0, a1, q); arm = lerp(r0, r1, q); elb = lerp(S.e0, S.e1, q);
      Object.assign(P, { armB: lerp(1.35, -0.9, q), lean: 0.35 });
      if (g) Object.assign(P, { sx: 1.1, sy: 0.93, legSpread: 1.75, bodyY: 2.4 });
    } else {
      // перехват: клинок прокручивается на пальце и возвращается в обратный хват
      const e = easeInOut(k.r), w1 = S.w1;
      const twirl = S.spin || nm === "rise" || S.stab ? TAU * e : 0;
      w = lerp(w1, w1 + wrapPi(DAG_REST - w1), e) - twirl;
      arm = lerp(S.a1, 0.85, e); elb = lerp(S.e1, 1.0, e);
      Object.assign(P, { armB: lerp(-0.9, 1.0, e), lean: lerp(0.3, 0.1, e) });
    }
    Object.assign(P, { armF: arm, elbowF: elb, wBlend: 1, wAngle: kb + (w - S.w0) });
  };

  /* ---------- приёмы: Цепной серп ---------- */
  const nearestEnemy = (g, p, maxDx) => {
    let best = null, bd = maxDx;
    for (const e of g.enemies) { if (!e.targetable) continue; const d = Math.abs(e.x - p.x); if (d < bd) { bd = d; best = e; } }
    return best;
  };
  /** Оглушить как обычный удар, прервавший замах (суперброню не ломаем — так же, как Enemy.damage). */
  const stagger = (e, g, stun) => {
    const armored = (e.state === "windup" && e.windT > e.windDur * 0.5) || e.state === "attack" || e.staggerImmune > 0;
    if (armored || !e.alive || e.executed) return;
    e.cancelAttack(g); e.setState("hurt"); e.hurtDur = stun; e.staggerImmune = 1.1;
  };

  const kusariMoves = {
    // дальняя цель, точное нажатие: цепь хлещет, обвивает и рывком тянет врага к герою (удар — на доле, подтягивание — после)
    kusariGrab: {
      kind: "custom", name: "Цепной захват", startup: 0.05, active: 0.16, recovery: 0.24, cancel: 0.18,
      dmg: 22, knock: 0, stun: 0.9, moveControl: 0.1,
      pose(P, act, p, k) {
        if (act.phase === "startup") Object.assign(P, { armF: lerp(1.0, 2.5, easeOut(k.s)), lean: -0.2 * k.s });
        else {
          // бросок: рука строго вперёд, цепь натянута; затем герой откидывается назад, выбирая цепь
          const pull = act.phase === "active" ? 0 : easeInOut(Math.min(1, k.r * 1.8));
          Object.assign(P, { armF: lerp(1.6, 0.6, pull), elbowF: 0.1 + 1.0 * pull, wBlend: 1, wAngle: baseAng(act, p, -0.05, "kc"), lean: lerp(0.35, -0.3, pull), armB: lerp(-0.5, -1.4, pull), sx: 1.12 - 0.1 * pull, bodyY: 2.4 });
          p.wExt = act.phase === "recovery" ? 1 - easeInOut(clamp((k.r - 0.55) / 0.45, 0, 1)) : 1;
        }
      },
      update(cs, p, act, dt, tA) {
        const g = cs.game, def = act.def;
        if (act.phase === "startup") p.vx = damp(p.vx, 0, 12, dt);
        if (act.phase === "active" && !act.fired) {
          act.fired = true;
          const e = act.target && act.target.targetable ? act.target : nearestEnemy(g, p, 260);
          const hand = CharacterRenderer.handWorld(p, 12);
          if (e) {
            const cy = e.centerY;
            act.dir = sign(e.x - p.x) || act.dir; p.facing = act.dir;
            // цепь — тонкая линия с белой сердцевиной от руки до цели, вспышка в точке захвата
            g.fx.cut(hand.x, hand.y, e.x, cy, "#9aa3b5", 2.6, 0.26);
            g.fx.cut(hand.x, hand.y, e.x, cy, "#ffffff", 1, 0.2);
            g.fx.glow(e.x, cy, 3, 16, p.skin.accent, 0.18, 0.4);
            g.sfx("slash", 1.3);
            cs._applyHit(e, act, act.dir, e.x, cy);
            if (e.alive && !e.executed && e.kind !== "brute") {
              stagger(e, g, def.stun);
              act.grabE = e; act.pullFrom = e.x;
              act.pullTo = clamp(p.x + act.dir * (e.w * e.scale * 0.5 + 18), 40, WORLD.w - 40);
              act.pullT = 0;
            }
          } else {
            g.fx.cut(hand.x, hand.y, hand.x + act.dir * 120, hand.y - 6, "#9aa3b5", 2.2, 0.2);     // промах: цепь просто хлещет воздух
            g.sfx("slash", 1);
          }
        }
        const e = act.grabE;
        if (e) {
          if (!e.alive || e.executed) act.grabE = null;
          else {
            act.pullT += dt;
            const q = clamp(act.pullT / 0.14, 0, 1);
            e.x = lerp(act.pullFrom, act.pullTo, easeOut(q)); e.vx = 0;
            if (q > 0.2 && q < 1 && act.pullT - dt <= 0.14) {
              const hand = CharacterRenderer.handWorld(p, 12);
              g.fx.cut(hand.x, hand.y, e.x, e.centerY, "#9aa3b5", 1.6, 0.06);
            }
            if (q >= 1) { g.fx.dust(e.x, e.y, 4); g.camera.shake(0.1); act.grabE = null; }
          }
        }
        if (act.phase === "recovery") p.vx = damp(p.vx, 0, 10, dt);
      },
    },
    // сильная доля, точно, вплотную: цепь вращается вокруг героя, втягивает врагов и бьёт троекратно
    kusariWhirl: {
      kind: "melee", spin: true, hits: 3, startup: 0.07, active: 0.3, recovery: 0.24, cancel: 0.22,
      dmg: 9, reach: 64, knock: 320, stun: 0.6, lunge: 10, arc: [-2.8, 2.6], fxR: 1.9, fxW: 0.8, lash: true, name: "Вихрь цепи",
      update(cs, p, act, dt, tA) {
        if (act.phase !== "active") return;
        const g = cs.game, def = act.def;
        // вихрь втягивает всех в радиусе к центру (но не вплотную), цепь рисует орбиту
        for (const e of g.enemies) {
          if (!e.targetable || e.kind === "brute") continue;
          const dx = p.x - e.x, ad = Math.abs(dx);
          if (ad < def.reach * 1.3 && ad > 16) { e.x += sign(dx) * Math.min(ad - 16, 120 * dt); }
        }
        act.orbT = (act.orbT || 0) - dt;
        if (act.orbT <= 0) {
          act.orbT = 0.035;
          const th = (act.t - tA) * 34, r = def.reach * 0.95, cx = p.x, cy = p.y - 20;
          const x0 = cx + Math.cos(th) * r * 0.35, y0 = cy + Math.sin(th) * r * 0.35 * 0.55;
          g.fx.cut(x0, y0, cx + Math.cos(th) * r, cy + Math.sin(th) * r * 0.55, "#ffffff", 1.2, 0.12);
        }
      },
      pose(P, act, p, k) {
        if (act.phase === "active") {
          Object.assign(P, { armF: 2.6, elbowF: 0.1, wBlend: 1, wAngle: kb(act, p) + TAU * 2.4 * k.a, armB: -1.7, sx: 1.08, sy: 0.94, cloak: -1.2, bodyY: 1.6, legSpread: 1.9 });
          p.wExt = 1;
        }
      },
    },
  };
  // опорный угол вращения для позы приёмов набора (приём не из таблицы — база от текущего угла)
  const kb = (act, p) => baseAng(act, p, -1.6, "kc");

  /* ---------- приёмы: Багровая катана ---------- */
  const katanaMoves = {
    // сильная доля после паузы: рывок сквозь цель без видимого урона, «щелчок» ножен на следующей доле — враг рассечён
    katanaIai: {
      kind: "custom", name: "Иай", startup: 0.07, active: 0.1, recovery: 0.3, cancel: 0.4,
      dmg: 24, knock: 0, stun: 0.5, moveControl: 0.05,
      pose(P, act, p, k) {
        const kbA = baseAng(act, p, KAT_REST, "kc");
        if (act.phase === "startup") {      // низкая стойка: ладонь на рукояти, корпус подан вперёд, дрожь напряжения
          Object.assign(P, { armF: 0.45, elbowF: 0.95, wBlend: 1, wAngle: kbA, lean: -0.2 - 0.1 * k.s, bodyY: 3 + 0.3 * Math.sin(act.t * 70), sy: 0.9, sx: 1.06, legSpread: 2.0, armB: 0.2 });
        } else if (act.phase === "travel") {
          Object.assign(P, { armF: 1.5, elbowF: 0.05, wBlend: 1, wAngle: kbA + (-0.1 - KAT_REST), lean: 0.85, bodyY: 2, sx: 1.34, sy: 0.8, legSpread: 2.1, armB: -1.5, cloak: -1.3 });
        } else if (act.phase === "active") {
          Object.assign(P, { armF: 1.5, elbowF: 0.05, wBlend: 1, wAngle: kbA + (-0.1 - KAT_REST), lean: 0.6, bodyY: 2.4, sx: 1.2, sy: 0.88, legSpread: 2.0, armB: -1.2, cloak: -0.8 });
        } else {
          // после прохода герой стоит спиной к врагу; первая половина — стряхнуть, вторая — вложить клинок до щелчка
          const f = Math.min(1, k.r / 0.5), n = Math.max(0, (k.r - 0.5) / 0.5);
          if (k.r < 0.5) {
            Object.assign(P, { armF: lerp(1.5, 1.1, easeOut(f)), elbowF: 0.1, wBlend: 1, wAngle: kbA + (lerp(-0.1, KAT_TIB, easeOut(f)) - KAT_REST) + Math.sin(f * TAU * 2) * 0.16 * (1 - f), lean: lerp(0.5, 0.2, f), bodyY: lerp(2.4, 1.2, f), armB: -0.5 });
          } else {
            Object.assign(P, { armF: lerp(1.1, 0.45, easeInOut(n)), elbowF: lerp(0.1, 0.95, easeInOut(n)), wBlend: 1, wAngle: kbA + (lerp(KAT_TIB, KAT_REST, easeInOut(n)) - KAT_REST), lean: lerp(0.2, 0.02, n), bodyY: lerp(1.2, 0.4, n), armB: lerp(-0.5, 0.4, n) });
          }
        }
      },
      update(cs, p, act, dt, tA) {
        const g = cs.game, def = act.def;
        if (!act.ki) {
          act.ki = true;
          const tg = act.target && act.target.targetable ? act.target : nearestEnemy(g, p, 300);
          act.tg = tg;
          if (tg) {
            act.dir = sign(tg.x - p.x) || act.dir; p.facing = act.dir;
            act.dashTo = clamp(tg.x + act.dir * (tg.w * tg.scale * 0.5 + 24), 40, WORLD.w - 40);
            act.travel = clamp(Math.abs(act.dashTo - p.x) / 1500, 0.06, 0.16);
          } else { act.dashTo = clamp(p.x + act.dir * 150, 40, WORLD.w - 40); act.travel = 0.1; }
          // щелчок — на ближайшей доле после прохода; приём не отменяется раньше (иначе удар не состоится)
          const P = period(cs), startAt = g.songNow;
          act.clickSong = g.clock.nextBeatAfter(act.impactSong, P * 0.6);
          const tClick = act.startup + (act.clickSong - act.impactSong);
          act.tClick = Math.max(tClick, act.startup + act.travel + act.active + 0.18);
          act.total = act.tClick + 0.2;
          act.recovery = act.total - act.startup - act.travel - act.active;
          act.cancel = act.total - 0.03;
          act.startX = p.x;
        }
        if (act.phase === "startup") { p.vx = damp(p.vx, 0, 15, dt); act.startX = p.x; act.iframes = false; }
        if (act.phase === "travel") {
          if (!act.passFx) {
            act.passFx = true;
            // росчерк прохода: тонкая линия от начала до конца пути + диагональный след клинка на враге
            const tg = act.tg;
            g.fx.cut(act.startX, p.y - 18, act.dashTo, p.y - 18, p.skin.accent, 2.4, 0.3);
            g.fx.cut(act.startX, p.y - 18, act.dashTo, p.y - 18, "#ffffff", 0.9, 0.22);
            if (tg) {
              const a = act.dir * 0.75, L = 38 * tg.scale, cy = tg.centerY;
              g.fx.cut(tg.x - Math.cos(a) * L, cy - Math.sin(a) * L, tg.x + Math.cos(a) * L, cy + Math.sin(a) * L, "#ffffff", 1.4, 0.3);
              tg.flash = 0.4;
              // цель получает лишь четверть урона без эффектов — основной удар прозвучит в щелчке
              tg.hp = Math.max(1, tg.hp - def.dmg * 0.25 * g.diff.playerDmg * act.power);
            }
            g.sfx("dash"); g.sfx("slash", 1.5); g.camera.shake(0.1);
          }
          act.iframes = true; act.noGravity = true; p.vy = 0;
          const q = clamp((act.t - act.startup) / Math.max(0.01, act.travel), 0, 1);
          const nx = lerp(act.startX, act.dashTo, easeOut(q));
          p.vx = (nx - p.x) / Math.max(dt, 1e-4);
          g.addAfterimage(p);
        } else if (act.phase !== "startup") { act.iframes = false; act.noGravity = false; }
        if (act.phase === "active" || act.phase === "recovery") p.vx = damp(p.vx, 0, 11, dt);
        // щелчок ножен: на доле (или по времени приёма, если музыка и игровое время разошлись из-за замедления)
        if (!act.clicked && act.phase === "recovery" && (g.songNow >= act.clickSong - 0.01 || act.t >= act.tClick + 0.1)) {
          act.clicked = true;
          g.sfx("draw"); g.sfx("hit", 1.1, true);
          const e = act.tg;
          if (e && e.alive && !e.executed) {
            const a = act.dir * 0.75, L = 44 * e.scale, cy = e.centerY;
            g.fx.cut(e.x - Math.cos(a) * L, cy - Math.sin(a) * L, e.x + Math.cos(a) * L, cy + Math.sin(a) * L, p.skin.accent, 3.2, 0.34);
            g.fx.cut(e.x - Math.cos(a) * L, cy - Math.sin(a) * L, e.x + Math.cos(a) * L, cy + Math.sin(a) * L, "#ffffff", 1.2, 0.26);
            g.fx.glow(e.x, cy, 4, 22, "#ffffff", 0.16, 0.45);
            cs._applyHit(e, act, act.dir, e.x, cy);
          } else g.fx.ring(p.x + act.dir * 4, p.y - 20, 3, 16, "#ffffff", 0.2, 1.4);
        }
      },
    },
    // сильная доля в потоке ударов вплотную: четыре разреза на четвертях доли, лепестки сыплются от клинка
    katanaPetals: {
      kind: "melee", hits: 4, startup: 0.05, active: 0.4, recovery: 0.22, cancel: 0.3,
      dmg: 7, reach: 44, knock: 220, stun: 0.55, lunge: 80, arc: [-2.6, 1.0], fxR: 1.15, fxW: 0.6, name: "Танец лепестков",
      update(cs, p, act, dt, tA) {
        const g = cs.game, def = act.def;
        if (!act.kp) {
          act.kp = true;
          // активная фаза = одна доля: разрезы идут на четвертях
          const na = clamp(period(cs), 0.3, 0.72), d = na - act.active;
          act.active = na; act.total += d; act.recovery = act.total - act.startup - act.travel - act.active;
          act.cancel = act.total - 0.12;
          act.sub = 0; act.petal = -1;
        }
        if (act.phase !== "active") return;
        const n = Math.min(def.hits - 1, Math.floor((act.t - tA) / (act.active / def.hits)));
        if (n !== act.petal) {
          act.petal = n;
          if (n > 0) p.vx = act.dir * 70;
          // лепестки: россыпь розовых искр вдоль разреза и маленький росчерк
          const cx = p.x + act.dir * 26, cy = p.y - 20 + (n % 2 ? 6 : -6);
          g.fx.sparks(cx, cy, 7, "#ff7a9c", 190, act.dir > 0 ? -0.5 : Math.PI + 0.5, 2.2, 0.55);
          if (!g.fx.low) g.fx.cut(cx - act.dir * 18, cy + (n % 2 ? -12 : 12), cx + act.dir * 20, cy + (n % 2 ? 12 : -12), "#ffffff", 1.1, 0.14);
        }
      },
      pose(P, act, p, k) {
        if (act.phase !== "active") return;
        const { s, u } = subOf(act, k), q = easeOut(Math.min(1, u * 1.5));
        // 4 разреза: вверх-вперёд, вниз-наискось, вверх-назад, крупный сверху
        const W = [[KAT_REST, -0.6], [-1.0, 1.0], [2.4, -1.4], [-2.6, 0.9]][s];
        const A = [[0.45, 1.5], [2.2, 1.3], [0.8, 2.2], [2.9, 1.4]][s];
        const kbA = baseAng(act, p, KAT_REST, "kc");
        Object.assign(P, { armF: lerp(A[0], A[1], q), elbowF: lerp(0.7, 0.05, q), wBlend: 1, wAngle: kbA + (lerp(W[0], W[1], q) - KAT_REST), lean: 0.4 + 0.1 * (s % 2), armB: s % 2 ? 0.6 : -1.3, bodyY: 2.2 + (s % 2) * 0.8, cloak: s % 2 ? 0.9 : -0.9, headTilt: s % 2 ? -0.1 : 0.1 });
      },
    },
  };

  /* ---------- приёмы: Теневой кинжал ---------- */
  const daggerMoves = {
    // perfect-нажатие на средней дистанции: исчезает в тени и бьёт врага со спины
    daggerStep: {
      kind: "custom", name: "Теневой шаг", startup: 0.05, active: 0.1, recovery: 0.2, cancel: 0.14,
      dmg: 18, reach: 36, knock: 230, stun: 0.5, moveControl: 0.05,
      pose(P, act, p, k) {
        const kbA = baseAng(act, p, DAG_REST, "kc");
        if (act.phase === "startup") {
          // растворение: силуэт сужается в тонкую линию и подаётся назад
          Object.assign(P, { sx: lerp(1, 0.18, easeIn(k.s)), sy: 1 + 0.08 * k.s, lean: -0.4 * k.s, armF: 1.0, elbowF: 0.8, wBlend: 1, wAngle: kbA, armB: -0.6, bodyY: 1.5 });
        } else if (act.phase === "active") {
          // выход из тени со спины: глубокий выпад, клинок вперёд
          Object.assign(P, { sx: lerp(0.5, 1.28, easeOut(Math.min(1, k.a * 2.5))), sy: 0.86, lean: 0.8, bodyY: 2.6, legSpread: 2.0, armF: 1.5, elbowF: 0.1, wBlend: 1, wAngle: kbA + (lerp(DAG_REST, 0.0, easeOut(k.a)) - DAG_REST), armB: -1.4, cloak: -1.2 });
        } else {
          const e = easeInOut(k.r);
          Object.assign(P, { sx: 1.1 - 0.1 * e, sy: 0.9 + 0.1 * e, lean: lerp(0.5, 0.1, e), bodyY: lerp(2.2, 1.5, e), legSpread: 1.7, armF: lerp(1.5, 0.85, e), elbowF: lerp(0.1, 1.0, e), wBlend: 1, wAngle: kbA + (lerp(0.0, DAG_REST, e) - DAG_REST) - TAU * e, armB: lerp(-1.2, 1.0, e) });
        }
      },
      update(cs, p, act, dt, tA) {
        const g = cs.game, def = act.def;
        if (act.phase === "startup") {
          act.iframes = true; p.vx = damp(p.vx, 0, 15, dt);
          if (!act.vanFx) { act.vanFx = true; g.fx.smoke(p.x, p.y - 14, 6, "#0b0c10", 0.55); g.fx.ring(p.x, p.y - 16, 3, 20, p.skin.accent, 0.25, 1.6); g.sfx("dash", 1.2); }
        }
        if (act.phase === "active" && !act.fired) {
          act.fired = true; act.iframes = false;
          const e = act.target && act.target.targetable ? act.target : nearestEnemy(g, p, 240);
          if (e) {
            const side = sign(e.x - p.x) || act.dir;
            const to = clamp(e.x + side * (e.w * e.scale * 0.5 + 16), 40, WORLD.w - 40);
            // след между точками исчезновения и появления
            g.fx.cut(p.x, p.y - 16, to, p.y - 16, p.skin.accent, 1.6, 0.18);
            g.addAfterimage(p);
            p.x = to; p.vx = 0; act.dir = -side; p.facing = act.dir;
            g.fx.smoke(p.x, p.y - 14, 6, "#0b0c10", 0.5); g.fx.ring(p.x, p.y - 16, 3, 20, p.skin.accent, 0.25, 1.6);
            act.power *= 1.15;          // удар в спину сильнее
            cs._thrustFx(p, act);
            g.sfx("slash", 1.5);
            g.camera.kick(0.012);
          } else { cs._thrustFx(p, act); g.sfx("slash", 1.2); }
        }
        if (act.phase === "active") cs._meleeHits(p, act, false);
        if (act.phase === "recovery") p.vx = damp(p.vx, 0, 10, dt);
      },
    },
    // хорошее нажатие издалека: три метательных ножа веером (по урону — как «Веер»)
    daggerKnives: {
      kind: "custom", name: "Веер ножей", startup: 0.06, active: 0.12, recovery: 0.22, cancel: 0.15,
      dmg: 7, knock: 90, stun: 0.2, moveControl: 0.3,
      pose(P, act, p, k) {
        const kbA = baseAng(act, p, DAG_REST, "kc");
        if (act.phase === "startup") {
          // рука с ножами уходит назад-вверх, корпус скручивается
          Object.assign(P, { armF: lerp(1.0, -1.7, easeOut(k.s)), elbowF: lerp(1.0, 0.5, k.s), wBlend: 1, wAngle: kbA + (lerp(DAG_REST, 2.9, k.s) - DAG_REST), lean: -0.25 * k.s, armB: 0.9, bodyY: 1.5 + 1.2 * k.s, legSpread: 1.7 });
        } else if (act.phase === "active") {
          Object.assign(P, { armF: lerp(-1.7, 1.75, easeOut(Math.min(1, k.a * 2.2))), elbowF: 0.05, wBlend: 1, wAngle: kbA + (0.0 - DAG_REST), lean: 0.4, armB: -1.2, bodyY: 2.0, sx: 1.12, sy: 0.92, legSpread: 1.8 });
        } else {
          const e = easeInOut(k.r);
          Object.assign(P, { armF: lerp(1.75, 0.85, e), elbowF: lerp(0.05, 1.0, e), wBlend: 1, wAngle: kbA + (lerp(0.0, DAG_REST, e) - DAG_REST) - TAU * e, lean: lerp(0.35, 0.1, e), armB: lerp(-1.0, 1.0, e) });
        }
      },
      update(cs, p, act, dt, tA) {
        const g = cs.game, def = act.def;
        if (act.phase === "startup") p.vx = damp(p.vx, 0, 12, dt);
        if (act.phase === "active" && !act.fired) {
          act.fired = true;
          const hand = CharacterRenderer.handWorld(p, 10);
          const ang0 = act.target ? Math.atan2(act.target.centerY - hand.y, act.target.x - hand.x) : (act.dir > 0 ? 0 : Math.PI);
          for (let i = -1; i <= 1; i++) {
            const a = ang0 + i * 0.055;
            cs.spawnProjectile({ x: hand.x, y: hand.y + i * 2, vx: Math.cos(a) * 1050, vy: Math.sin(a) * 1050, owner: "player", act, r: 2.8, color: p.skin.accent, life: 0.5 });
            g.fx.cut(hand.x, hand.y + i * 2, hand.x + Math.cos(a) * 46, hand.y + i * 2 + Math.sin(a) * 46, p.skin.accent, 1.3, 0.1);
          }
          g.fx.glow(hand.x, hand.y, 2, 12, "#ffffff", 0.1, 0.5);
          g.sfx("slash", 1.6); g.sfx("slash", 1.3);
          g.camera.kick(0.008);
        }
        if (act.phase === "recovery") p.vx = damp(p.vx, 0, 10, dt);
      },
    },
  };

  /* ---------- наборы: выбор приёма ---------- */
  registerKit("kusari", {
    moves: kusariMoves,
    pose: kusariPose,
    choose(cs, name, c) {
      if (!c.target || c.air) return;
      // сильная доля вплотную (место подброса) → вихрь цепи; подброс не нужен — цепь и так втягивает врагов
      if (name === "rise") { cs.lastRiseT = cs.time; return "kusariWhirl"; }
      // точное нажатие на средней дистанции (не ближний бой) → захват; не чаще, чем раз в 0,8 с
      if (name === "dash" && c.good && c.dx >= 52 && cs.time - (cs.kbGrabT == null ? -9 : cs.kbGrabT) > 0.8) { cs.kbGrabT = cs.time; return "kusariGrab"; }
    },
    takedown(cs, kind) { return kind === "xcut" ? "kusariCoil" : null; },
  });
  registerKit("katana", {
    moves: katanaMoves,
    pose: katanaPose,
    choose(cs, name, c) {
      if (!c.target || c.air) return;
      if ((name === "rise" || name === "dash") && c.j.strong && c.good && c.dx <= 200) {
        const P = c.j.period || period(cs), pause = cs.time - cs.lastActionT > 1.1 * P;
        if (name === "rise") cs.lastRiseT = cs.time;
        // после паузы — иай (рывок и щелчок на следующей доле), в потоке ударов вплотную — танец лепестков
        if (pause) return "katanaIai";
        if (name === "rise") return "katanaPetals";
      }
    },
    takedown(cs, kind) { return kind === "xcut" ? "katanaIai" : null; },
  });
  registerKit("dagger", {
    moves: daggerMoves,
    pose: daggerPose,
    choose(cs, name, c) {
      if (!c.target || c.air || name !== "dash" || !c.good) return;
      // издалека — ножи веером, на средней дистанции при perfect — теневой шаг (перезарядка ~1 с)
      if (cs.time - (cs.kbDagT == null ? -9 : cs.kbDagT) < 1.0) return;
      if (c.dx >= 105) { cs.kbDagT = cs.time; return "daggerKnives"; }
      if (c.j.rating === "perfect") { cs.kbDagT = cs.time; return "daggerStep"; }
    },
    takedown(cs, kind) { return kind === "xcut" ? "daggerFlurry" : null; },
  });

  /* ---------- добивания ---------- */
  const diag = (g, e, dir, col, w, life, big = false) => {
    const a = dir * 0.75, L = (big ? 46 : 38) * e.scale, cy = e.centerY;
    const x0 = e.x - Math.cos(a) * L, y0 = cy - Math.sin(a) * L, x1 = e.x + Math.cos(a) * L, y1 = cy + Math.sin(a) * L;
    g.fx.cut(x0, y0, x1, y1, col, w, life);
    g.fx.cut(x0, y0, x1, y1, "#ffffff", w * 0.36, life * 0.75);
  };

  // Катана «ОДИН ВЗМАХ»: напряжение в стойке иай → мгновенный проход сквозь врага → тишина → щелчок ножен, враг распадается.
  registerTakedown("katanaIai", {
    name: "ОДИН ВЗМАХ", dur: 1.1, death: "split",
    update(cs, td, api) {
      const g = cs.game, p = g.player, e = td.e, d = td.dir, t = api.t;
      const far = clamp(e.x + d * 52, 40, WORLD.w - 40);
      p.y = td.py; p.facing = d;
      if (t < 0.3) p.x = td.px;
      else if (t < 0.4) p.x = lerp(td.px, far, easeOut((t - 0.3) / 0.1));
      else p.x = far;
      api.once("glint", 0.16, () => { const h = CharacterRenderer.handWorld(p, 6); if (!api.low) g.fx.glow(h.x, h.y, 1, 9, "#ffffff", api.life(0.2), 0.5); g.sfx("draw"); });
      api.once("pass", 0.32, () => {
        api.streak(td.px, far, p.y - 18);
        diag(g, e, d, p.skin.accent, 3, api.life(0.4), true);
        if (!api.low) g.fx.glow(e.x, api.cy, 4, 16, "#ffffff", api.life(0.16), 0.4);
        g.sfx("dash"); g.sfx("slash", 1.6); g.camera.shake(0.14); e.flash = 0.5;
      });
      // тишина: враг стоит невредимым, только светится тонкая линия в воздухе
      api.once("ghost", 0.5, () => diag(g, e, d, "#ffffff", 0.9, api.life(0.25)));
      api.once("click", 0.82, () => {
        g.sfx("draw"); g.sfx("hit", 1.2, true);
        diag(g, e, d, p.skin.accent, 3.6, api.life(0.4), true);
        if (!api.low) g.fx.glow(e.x, api.cy, 5, 26, "#ffffff", api.life(0.2), 0.5);
        api.finish();
      });
    },
    pose(cs, p, td) {
      const t = td.t, ph = (a, b) => clamp((t - a) / (b - a), 0, 1);
      const kbA = KAT_REST;
      const P = { wBlend: 1, legAmp: 0, legSpread: 2.0 };
      if (t < 0.28) {
        const s = ph(0, 0.2);
        Object.assign(P, { armF: 0.45, elbowF: 0.95, wAngle: kbA, lean: -0.1 - 0.12 * easeOut(s), bodyY: 1 + 2.4 * easeOut(s) + 0.3 * Math.sin(t * 70) * s, sy: 1 - 0.08 * s, sx: 1 + 0.06 * s, armB: 0.55 - 0.7 * s, cloak: -0.3 });
      } else if (t < 0.4) {
        Object.assign(P, { armF: 1.5, elbowF: 0.05, wAngle: lerp(kbA, -0.12, easeOut(ph(0.28, 0.33))), lean: 0.85, bodyY: 2, sx: 1.34, sy: 0.8, armB: -1.5, cloak: -1.3 });
      } else if (t < 0.62) {
        const s = easeInOut(ph(0.42, 0.62));
        Object.assign(P, { armF: lerp(1.5, 1.7, s), elbowF: 0.05, wAngle: lerp(-0.12, -0.7, s), lean: lerp(0.6, 0.15, s), bodyY: lerp(2.4, 0.8, s), sx: lerp(1.2, 1.0, s), sy: lerp(0.9, 1, s), armB: lerp(-1.2, -0.4, s), cloak: lerp(-0.8, 0.2, s), legSpread: lerp(2, 1.5, s) });
      } else if (t < 0.74) {
        const f = ph(0.62, 0.74);       // тибури
        Object.assign(P, { armF: lerp(1.7, 1.1, easeOut(f)), elbowF: 0.1, wAngle: lerp(-0.7, KAT_TIB, easeOut(f)) + Math.sin(f * TAU * 2) * 0.16 * (1 - f), lean: 0.12, bodyY: 0.6, armB: -0.4, legSpread: 1.4 });
      } else {
        const n = easeInOut(ph(0.74, 0.86));    // ното: клинок в ножны, щелчок на 0.82
        Object.assign(P, { armF: lerp(1.1, 0.45, n), elbowF: lerp(0.1, 0.95, n), wAngle: lerp(KAT_TIB, kbA, n), lean: lerp(0.12, 0.0, n), bodyY: lerp(0.6, 0, n), armB: lerp(-0.4, 0.4, n), legSpread: lerp(1.4, 1.2, n), headTilt: -0.08 * Math.sin(n * Math.PI) });
      }
      return P;
    },
  });

  // Кусаригама «ЦЕПНЫЕ ОКОВЫ»: раскрутка → бросок → цепь обвивает → рывок врага к герою → подброс и удар о землю.
  registerTakedown("kusariCoil", {
    name: "ЦЕПНЫЕ ОКОВЫ", dur: 1.15, death: "slam",
    update(cs, td, api) {
      const g = cs.game, p = g.player, e = td.e, d = td.dir, t = api.t, cy = api.cy, col = p.skin.accent;
      p.y = td.py; p.x = td.px; p.facing = d;
      const hold = clamp(p.x + d * (e.w * e.scale * 0.5 + 24), 40, WORLD.w - 40);
      // враг скован: плечи прижаты, голова опущена
      const bound = clamp((t - 0.24) / 0.2, 0, 1);
      e.tdPose = { lean: -0.12 * bound, headTilt: -0.25 * bound, armF: lerp(0.35, 0.05, bound), armB: lerp(-0.3, 0.05, bound), bodyY: 1.5 * bound };
      api.once("throw", 0.24, () => {
        const h = CharacterRenderer.handWorld(p, 12);
        g.fx.cut(h.x, h.y, e.x, cy, "#9aa3b5", 2.6, api.life(0.3));
        g.fx.cut(h.x, h.y, e.x, cy, "#ffffff", 0.9, api.life(0.22));
        g.sfx("slash", 1.4); g.camera.shake(0.08);
      });
      // три витка цепи вокруг корпуса — тонкие дуги разной высоты
      [[0.3, -10, 0.4], [0.36, 0, 2.6], [0.42, 10, 1.0]].forEach(([tt, dy, a0], i) => api.once("coil" + i, tt, () => {
        g.fx.slashArc(e.x, cy + dy, 13 * e.scale, a0, a0 + TAU * 0.78, "#9aa3b5", 2, api.life(0.34));
        g.fx.slashArc(e.x, cy + dy, 13 * e.scale, a0, a0 + TAU * 0.78, "#ffffff", 0.8, api.life(0.26));
        e.flash = 0.35; g.sfx("slash", 1.1 + 0.15 * i);
      }));
      // рывок: враг скользит к герою
      const pull = easeIn(clamp((t - 0.48) / 0.16, 0, 1));
      if (t >= 0.48) e.x = lerp(td.ex, hold, pull);
      api.once("yank", 0.5, () => { api.streak(td.ex, hold, cy); g.sfx("dash"); g.camera.shake(0.18); });
      // подброс над головой и бросок вниз
      if (t >= 0.64 && t < 0.76) e.y = lerp(td.ey, td.ey - 30, easeOut((t - 0.64) / 0.12));
      else if (t >= 0.76) e.y = lerp(td.ey - 30, td.ey, easeIn(clamp((t - 0.76) / 0.07, 0, 1)));
      api.once("slam", 0.83, () => {
        e.y = td.ey;
        g.fx.cut(e.x, td.ey - 52, e.x, td.ey - 2, col, 3.2, api.life(0.4));
        g.fx.cut(e.x, td.ey - 52, e.x, td.ey - 2, "#ffffff", 1.1, api.life(0.3));
        g.fx.shockwave(e.x, td.ey, col, 150); g.fx.dust(e.x, td.ey, api.low ? 4 : 9); g.sfx("slam");
        api.finish();
      });
    },
    pose(cs, p, td) {
      const t = td.t, ph = (a, b) => clamp((t - a) / (b - a), 0, 1);
      const P = { wBlend: 1, legAmp: 0, legSpread: 1.9, bodyY: 2 };
      const kbA = -1.6;
      if (t < 0.24) {
        const s = easeOut(ph(0, 0.24));
        Object.assign(P, { armF: lerp(1.0, 2.6, s), elbowF: 0.2, wAngle: -1.6 - TAU * 2 * (1 - s), lean: -0.15 * s, armB: lerp(-0.3, -1.4, s), bodyY: 1 + 1.5 * s });
        p.wExt = 0.55;
      } else if (t < 0.5) {
        Object.assign(P, { armF: 1.65, elbowF: 0.05, wAngle: -0.05, lean: 0.4, armB: -0.6, sx: 1.1, sy: 0.94, bodyY: 2.4 });
        p.wExt = 1;
      } else if (t < 0.66) {
        const s = easeInOut(ph(0.5, 0.66));
        Object.assign(P, { armF: lerp(1.65, 0.5, s), elbowF: lerp(0.05, 1.1, s), wAngle: -0.05, lean: lerp(0.4, -0.35, s), armB: lerp(-0.6, -1.5, s), bodyY: 2.8, legSpread: 2.1 });
        p.wExt = 1;
      } else if (t < 0.8) {
        const s = easeOut(ph(0.66, 0.8));
        Object.assign(P, { armF: lerp(0.5, 3.0, s), elbowF: lerp(1.1, 0.1, s), wAngle: lerp(-0.05, -1.1, s), lean: lerp(-0.35, -0.12, s), armB: -1.2, bodyY: lerp(2.8, 0.5, s), sy: 1 + 0.08 * s, cloak: 0.6 });
        p.wExt = 0.7;
      } else {
        const s = easeOut(ph(0.8, 0.9)), r = easeInOut(ph(0.9, 1.1));
        Object.assign(P, { armF: lerp(3.0, 1.2, s) + (0.6 - 1.2) * r * 0, elbowF: 0.1, wAngle: lerp(-1.1, 0.8, s), lean: lerp(-0.12, 0.45, s) * (1 - r) , bodyY: lerp(0.5, 3, s) * (1 - r), sx: 1 + 0.15 * s * (1 - r), sy: 1 - 0.1 * s * (1 - r), armB: lerp(-1.2, 0.2, r), legSpread: lerp(1.9, 1.2, r) });
        p.wExt = lerp(1, 0, r);
      }
      return P;
    },
  });

  // Кинжал «ТЕНЕВАЯ ПЛЯСКА»: пять ударов из теней с разных сторон и сверху, финальный — в упор; враг оседает на месте.
  const DF = { t: [0.12, 0.2, 0.28, 0.36, 0.46], side: [-1, 1, -1, 1, 0], ang: [-0.9, 0.6, -0.4, 0.8, 1.57], dist: [26, 28, 22, 26, 0] };
  registerTakedown("daggerFlurry", {
    name: "ТЕНЕВАЯ ПЛЯСКА", dur: 0.98, death: "topple",
    update(cs, td, api) {
      const g = cs.game, p = g.player, e = td.e, d = td.dir, t = api.t, cy = api.cy, col = p.skin.accent;
      p.y = td.py;
      // положение героя по номеру последнего удара: каждый новый — из тени с другой стороны (сторона −1 — откуда начинали)
      let idx = -1;
      for (let i = 0; i < DF.t.length; i++) if (t >= DF.t[i] - 0.025) idx = i;
      if (idx < 0) { p.x = td.px; p.facing = d; }
      else {
        const sd = DF.side[idx], tx = sd === 0 ? e.x - d * 6 : clamp(e.x + sd * d * DF.dist[idx] * Math.max(1, e.scale), 40, WORLD.w - 40);
        p.x = tx; p.facing = sd === 0 ? d : -sign(sd) * d;
        // последний удар — сверху: короткий подскок над врагом
        p.y = idx === 4 ? td.py - 30 * Math.sin(Math.PI * clamp((t - 0.42) / 0.14, 0, 1)) : td.py;
      }
      DF.t.forEach((tt, i) => {
        api.once("jump" + i, tt - 0.025, () => {
          const px0 = p.x;
          g.addAfterimage(p);
          g.fx.smoke(px0, p.y - 14, 3, "#0b0c10", 0.4);
        });
        api.once("hit" + i, tt, () => {
          const big = i === 4, a = DF.ang[i] * (i % 2 ? -1 : 1) * d, L = (big ? 26 : 22) * e.scale;
          const x0 = e.x - Math.cos(a) * L, y0 = cy - Math.sin(a) * L, x1 = e.x + Math.cos(a) * L, y1 = cy + Math.sin(a) * L;
          g.fx.cut(x0, y0, x1, y1, col, big ? 3.6 : 2.6, api.life(big ? 0.4 : 0.3));
          g.fx.cut(x0, y0, x1, y1, "#ffffff", big ? 1.3 : 1, api.life(big ? 0.3 : 0.22));
          g.fx.sparks(e.x, cy, big ? 5 : 3, col, 170, null, Math.PI, 0.25);
          if (!api.low && big) g.fx.glow(e.x, cy, 4, 20, "#ffffff", api.life(0.16), 0.4);
          g.sfx("slash", 1.3 + 0.1 * i); g.sfx("hit", 0.8 + 0.1 * i);
          e.flash = 0.5; e.hitKick = 0.8; g.camera.shake(big ? 0.2 : 0.08);
        });
      });
      // враг вздрагивает от каждого удара и осыпается на месте
      const sag = clamp((t - 0.2) / 0.4, 0, 1);
      e.tdPose = { lean: -0.1 - 0.2 * sag, bodyY: 3 * sag, sy: 1 - 0.08 * sag, headTilt: -0.25 * sag };
      api.once("fin", 0.56, () => { g.sfx("draw"); api.finish(); });
    },
    pose(cs, p, td) {
      const t = td.t, ph = (a, b) => clamp((t - a) / (b - a), 0, 1);
      const P = { wBlend: 1, legAmp: 0, legSpread: 1.8, bodyY: 2.2, tuck: 0.15 };
      let idx = -1;
      for (let i = 0; i < DF.t.length; i++) if (t >= DF.t[i] - 0.025) idx = i;
      if (idx < 0) {
        const s = easeOut(ph(0, 0.1));
        Object.assign(P, { armF: lerp(0.85, 0.2, s), elbowF: 1.2, wAngle: DAG_REST, lean: 0.05 - 0.3 * s, armB: 1.2, sx: 1 - 0.1 * s, bodyY: 1 + 1.8 * s });
      } else {
        const ds = t - DF.t[idx], q = easeOut(clamp(ds / 0.07, 0, 1)), r = clamp((ds - 0.08) / 0.1, 0, 1);
        const big = idx === 4;
        Object.assign(P, {
          armF: lerp(0.2 + 0.4 * (idx % 2), big ? 2.9 : 1.55, q) * (1 - r) + 0.9 * r, elbowF: lerp(1.2, 0.05, q) * (1 - r) + 1.0 * r,
          wAngle: lerp(DAG_REST, big ? 1.57 : (idx % 2 ? -0.5 : 0.3), q),
          lean: lerp(-0.2, big ? 0.3 : 0.7, q), sx: 1 + 0.2 * q * (1 - r), sy: 1 - 0.12 * q * (1 - r), armB: lerp(1.2, -1.3, q), cloak: -0.8 * q, bodyY: 2.2 + 0.8 * q,
        });
        if (big) P.tuck = 0.5 * (1 - r);
        if (t > 0.6) {
          // перехват клинка и выпрямление
          const k = easeInOut(ph(0.6, 0.9));
          Object.assign(P, { armF: lerp(0.9, 0.85, k), elbowF: 1.0, wAngle: DAG_REST - TAU * k, lean: lerp(0.3, 0.05, k), bodyY: lerp(2.2, 0, k), legSpread: lerp(1.8, 1.2, k), armB: lerp(0, 1.0, k), sx: 1, sy: 1, tuck: 0 });
        }
      }
      return P;
    },
  });
}
