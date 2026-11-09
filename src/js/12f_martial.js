/* =====================================================================
   Рукопашные удары и джагл (по просьбе: «атаки, помимо оружия, ногами, локтями, коленями; подбрасывать противников
   комбинациями и в воздухе наносить удары»). Работают с ЛЮБЫМ оружием ближнего боя: оружие остаётся в руке (рука в защите),
   а бьют нога, колено или локоть. Одна кнопка атаки: приём выбирает martialChoose (вызывается из CombatSystem.chooseAttack
   после выбора общей логики и набора оружия) по ритму, дистанции и положению врага.

   Устройство приёма: kind "custom", martial: true — weaponDef не применяет множители оружия, kitPose/weaponPose/kitChoose/
   kitTakedown его не трогают. Поза (pose) — чистая функция от act: по ней же считается хитбокс (hitBox → limbBox), поэтому
   урон наносится ровно там, где нарисована нога/колено/локоть. Нога — две кости (бедро + голень) по ключам позы
   nK/nA/nB/nL (ближняя) и fK/fA/fB/fL (дальняя), см. 07_anim (kickLeg, _kickLeg); локоть — задняя рука поверх плаща (armFront).

   Приёмы (условия — в martialChoose):
     kickFront «Фронт-кик»   — после клинка (2-й удар серии), в такт, не на сильной доле; отбрасывает
     roundKick «Вертушка»    — удар ногой с разворота: 3-й удар серии на сильной доле (вместо «Вихря»)
     liftKick  «Подбив»      — нога снизу вверх на сильной доле: подбрасывает врага (джагл), герой взлетает следом
     kneeStrike «Колено»     — вплотную после клинка; к висящему в воздухе врагу — подскок и колено вверх
     elbow     «Локоть»      — вплотную после серии
     elbowSpin «Локоть с разворота» — враг за спиной: разворот и локоть
     sweepKick «Подсечка»    — низкий удар ногой: сбивает замах, долгое оглушение
     dropKick  «Двойной удар ногами» — в прыжке с места на средней дистанции
     airKnee / airKick       — удары в воздухе по висящему врагу (звенья джагла)
     axeKick   «Топор-кик»   — финал джагла: нога сверху вниз, враг вбит в землю с ударной волной
   Джагл — см. CombatSystem.launchEnemy/juggleHit/smashEnemy/enemyLanded и Enemy._physics (JUG в 11_enemies).
   ===================================================================== */
/** Выбор рукопашного приёма — вызывается из CombatSystem.chooseAttack (реализация в блоке ниже). */
let martialChooseFn = null;
function martialChoose(cs, cur, target, j) { return martialChooseFn ? martialChooseFn(cs, cur, target, j) : null; }
{
  const PI = Math.PI;
  const MIN_L = 4.6;                                   // длина звена обычной ноги (бедро+голень ≈ 9 ед.); в ударе нога вытягивается до 7
  const kOf = act => {
    const tA = act.startup + act.travel;
    return {
      s: clamp(act.t / Math.max(0.01, act.startup), 0, 1),
      a: clamp((act.t - tA) / Math.max(0.01, act.active), 0, 1),
      r: clamp((act.t - tA - act.active) / Math.max(0.01, act.recovery), 0, 1),
    };
  };
  /** Рука с оружием в защите: клинок/древко поднят перед корпусом. */
  const guard = (P, up = -1.25) => Object.assign(P, { armF: 0.55, elbowF: 1.9, wBlend: 1, wAngle: up });
  /** Нога: вес w (0 — обычная, 1 — в ударе), углы бедра a и голени b, длина звена L. */
  const leg = (P, near, w, a, b, L = 7) => {
    const [kw, ka, kb, kl] = near ? ["nK", "nA", "nB", "nL"] : ["fK", "fA", "fB", "fL"];
    P[kw] = w; P[ka] = a; P[kb] = b; P[kl] = L;
  };
  /** Вес ноги по ходу приёма: входит в удар на подготовке, держится, выходит к концу доводки. */
  const wLeg = k => k.r > 0.55 ? 1 - easeIn((k.r - 0.55) / 0.45) : easeOut(clamp(k.s * 1.6, 0, 1));
  const lenAt = (k, L = 7) => lerp(MIN_L, L, k.r > 0.4 ? 1 - easeInOut((k.r - 0.4) / 0.6) : easeOut(k.s));

  /* ---------- хитбокс по позе: там, где нарисована нога/колено/локоть ---------- */
  const SC = {};
  const shape = (def, p, act) => {
    for (const key in SC) delete SC[key];
    SC.bodyY = 0.5; SC.lean = 0; SC.turn = 0;
    def.pose(SC, act, p, kOf(act));
    return SC;
  };
  function limbBox(def, p, act) {
    const S = shape(def, p, act), d = act.dir;
    const tc = S.turn ? Math.cos(TAU * S.turn) : 1, X = d * (tc < 0 ? -1 : 1);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    const add = (lx, ly) => { const wx = p.x + X * lx, wy = p.y + ly; if (wx < x0) x0 = wx; if (wx > x1) x1 = wx; if (wy < y0) y0 = wy; if (wy > y1) y1 = wy; };
    let pad = 6;
    if (def.limb === "elbow") {
      // плечо повёрнуто вокруг бедра на lean, локоть — на длину плеча от него
      const hipY = -9 + S.bodyY, sy = hipY - 9.5 + 0.5, ln = S.lean || 0;
      const ex = 1 + Math.sin(S.armB) * 6, ey = sy + Math.cos(S.armB) * 6;
      const rx = ex * Math.cos(ln) - (ey - hipY) * Math.sin(ln), ry = hipY + ex * Math.sin(ln) + (ey - hipY) * Math.cos(ln);
      add(rx, ry); add(rx * 0.5, ry); pad = 8;
    } else {
      for (const near of def.limb === "nf" ? [true, false] : [true]) {
        const L = kickLeg(S, near);
        if (def.limb === "knee") { add(L.kx, L.ky); pad = 7; }
        else { add(L.hx, L.hy); add(L.kx, L.ky); add(L.ex, L.ey); }
      }
    }
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
  }

  /* ---------- общие части механики ---------- */
  /** Подлёт к цели: вертикаль и горизонталь (подскок к висящему врагу, догон в воздухе). */
  const chase = (p, act, vyMax, vxMax, aim = 0) => {
    const e = act.target;
    if (!e || !e.alive) return;
    p.vy = clamp((e.centerY + aim - p.centerY) * 12, -vyMax, vyMax * 0.6);
    const gap = Math.abs(e.x - p.x) - e.w * e.scale / 2 - p.w / 2;
    p.vx = act.dir * clamp((gap - 6) * 12, 0, vxMax);
  };
  /** Звук: взмах + глухой низкий «толчок» (удар ногой/коленом/локтем весомее и ниже клинка). */
  const kickSound = (g, v = 1.15, f = 135, vol = 0.3) => {
    g.sfx("slash", v);
    const s = g.audio && g.audio.sfx;
    if (s && s.tone) {
      s.tone({ f, f2: f * 0.33, dur: 0.13, vol });
      if (s.noiseBurst) s.noiseBurst({ ft: "lowpass", f: 650, f2: 180, dur: 0.09, vol: vol * 0.8 });
    }
  };
  /** Мировая точка конечности (стопа / колено / локоть) в доле frac активной фазы — по той же позе, что и хитбокс. */
  const limbPoint = (def, p, act, frac) => {
    const a2 = Object.assign({}, act, { t: act.startup + act.travel + act.active * frac, phase: "active" });
    const S = shape(def, p, a2), d = act.dir;
    const tc = S.turn ? Math.cos(TAU * S.turn) : 1, X = d * (tc < 0 ? -1 : 1);
    let lx, ly;
    if (def.limb === "elbow") {
      const hipY = -9 + S.bodyY, sy = hipY - 9.5 + 0.5, ln = S.lean || 0;
      const ex = 1 + Math.sin(S.armB) * 6, ey = sy + Math.cos(S.armB) * 6;
      lx = ex * Math.cos(ln) - (ey - hipY) * Math.sin(ln); ly = hipY + ex * Math.sin(ln) + (ey - hipY) * Math.cos(ln);
    } else {
      const L = kickLeg(S, true);
      if (def.limb === "knee") { lx = L.kx; ly = L.ky; } else { lx = L.ex; ly = L.ey; }
    }
    return { x: p.x + X * lx, y: p.y + ly };
  };
  /** Яркий след удара: росчерк по пути стопы/колена/локтя (неон + белая сердцевина), вспышка и кольцо в точке удара, пыль. */
  const strikeFx = (g, p, act, def, o = {}) => {
    const col = p.skin.accent, w = (o.w || 5) + (act.empowered ? 2 : 0), low = g.fx.low;
    const a = limbPoint(def, p, act, 0), b = limbPoint(def, p, act, 0.45), c = limbPoint(def, p, act, 1);
    g.fx.cut(a.x, a.y, b.x, b.y, col, w, 0.24); g.fx.cut(b.x, b.y, c.x, c.y, col, w + 1, 0.26);
    g.fx.cut(a.x, a.y, b.x, b.y, "#ffffff", 1.5, 0.16); g.fx.cut(b.x, b.y, c.x, c.y, "#ffffff", 1.8, 0.18);
    g.fx.ring(c.x, c.y, 3, o.ring || 24, col, 0.26, 3);
    if (!low) g.fx.glow(c.x, c.y, 4, (o.ring || 24) * 0.8, "#ffffff", 0.16, 0.6);
    g.fx.sparks(c.x, c.y, 5, col, 220, act.dir > 0 ? 0 : Math.PI, 1.3, 0.3);
    if (o.dust !== false) g.fx.dust(p.x - act.dir * 2, p.y, 4);
    return c;
  };
  /** Подскок при ударе ногой: видно, что удар с выпадом/прыжком, а не «шевеление» ноги. */
  const hop = (p, act, v, vx) => { if (p.onGround) { p.vy = -v; p.onGround = false; if (vx) p.vx = act.dir * vx; } };

  /** Общий шаг приёма: инициализация (серия, оружие в защите), гашение скорости, попадания в активной фазе. */
  function mstep(def) {
    return function (cs, p, act, dt, tA) {
      if (!act.mInit) {
        act.mInit = true;
        if (def.mstep != null) { cs.comboStep = def.mstep; cs.lastMeleeT = cs.time; }
        if (def.launch) cs.lastRiseT = cs.time;
        p.pistolT = 0;
        const e = act.target;
        act.chase = !!(def.chase && e && !e.onGround && e.centerY < p.centerY - 18);
      }
      p.wExt = 0;                                       // цепь кусаригамы в покое
      if (def.step) def.step(cs, p, act, dt, tA);
      // шаг вперёд в ударе (обычное «lunge» гаснет за пару шагов физики): держим скорость до упора во врага
      if (def.lunge && act.phase === "active" && p.onGround) {
        const e = act.target, gap = e ? Math.abs(e.x - p.x) - e.w * e.scale / 2 - p.w / 2 : 99;
        p.vx = gap < 5 ? 0 : act.dir * def.lunge * (1 - 0.4 * kOf(act).a);
      }
      if (act.phase === "active") cs._meleeHits(p, act, false);
    };
  }
  const grounded = (p, dt, k) => { p.vx = damp(p.vx, 0, k, dt); };

  const MOVES = {
    /* Фронт-кик: после клинка. Короткий толчок бедром и прямая нога на уровне корпуса — отбрасывает. */
    kickFront: {
      name: "Фронт-кик", startup: 0.08, active: 0.1, recovery: 0.24, cancel: 0.17, dmg: 14, knock: 430, stun: 0.5, lunge: 130, mstep: 2, limb: "n",
      fx(g, p, act) { kickSound(g, 1.2, 150); strikeFx(g, p, act, this); hop(p, act, 120, this.lunge); },
      step(cs, p, act, dt) {
        // подшаг: в подготовке герой подходит к врагу, чтобы нога дотянулась (зазор до ~40)
        if (act.phase === "startup" || act.phase === "travel") {
          const e = act.target, gap = e ? Math.abs(e.x - p.x) - e.w * e.scale / 2 - p.w / 2 : 0;
          const left = Math.max(0.03, act.startup - act.t + 0.03);
          if (e && gap > 12 && p.onGround) p.vx = act.dir * clamp((gap - 10) / left, 0, 340); else grounded(p, dt, 12);
        } else if (act.phase === "recovery") grounded(p, dt, 9);
      },
      pose(P, act, p, k) {
        const ph = act.phase;
        const ext = ph === "startup" ? 0 : ph === "active" ? easeOut(Math.min(1, k.a * 2.2)) : 1 - easeInOut(Math.min(1, k.r * 1.6));
        const ch = ph === "startup" ? easeOut(k.s) : 1;                 // колено подтянуто вперёд-вверх, голень свисает
        const a = lerp(0.2, 1.75, ch) + 0.4 * ext + (ph === "recovery" ? -1.3 * easeInOut(k.r) : 0);
        const b = lerp(0.1, 0.0, ch) + 2.3 * ext;                        // выпрямление: стопа выше бедра, на уровне корпуса
        leg(P, true, wLeg(k), a, b, lenAt(k, 8.8));
        Object.assign(P, { lean: ph === "startup" ? -0.12 * k.s : ph === "active" ? -0.3 : -0.3 * (1 - k.r), bodyY: 0.3 + 0.5 * (1 - ext) - 0.9 * ext, legSpread: 1.35, armB: -1.15, elbowB: 0.5, headTilt: -0.08, cloak: ph === "active" ? -0.6 : 0, sy: 0.99 });
        guard(P);
      },
    },

    /* Вертушка: удар ногой с разворота. Корпус делает оборот (turn), нога идёт назад-вверх из-за спины и бьёт по дуге. */
    roundKick: {
      name: "Вертушка", startup: 0.1, active: 0.12, recovery: 0.26, cancel: 0.2, dmg: 21, knock: 330, stun: 0.45, lunge: 90, mstep: 3, limb: "n",
      fx(g, p, act) { kickSound(g, 1.5, 120, 0.36); strikeFx(g, p, act, this, { w: 7, ring: 30 }); hop(p, act, 150, this.lunge); },
      step(cs, p, act, dt) { if (act.phase !== "active") grounded(p, dt, 11); },
      pose(P, act, p, k) {
        const ph = act.phase;
        // оборот: 0 → 0.25 на подготовке, 0.25 → 0.75 в ударе (спиной к врагу — нога идёт «назад» в локальных осях), до 1 в доводке
        const turn = ph === "startup" ? 0.25 * easeInOut(k.s) : ph === "active" ? 0.25 + 0.5 * k.a : 0.75 + 0.25 * easeOut(k.r);
        const ext = ph === "active" ? Math.pow(Math.sin(PI * clamp(k.a * 0.9 + 0.05, 0, 1)), 0.55) : 0;
        const wind = ph === "startup" ? easeOut(k.s) : 1;            // нога заведена назад-вниз к концу подготовки, в ударе — назад-вверх на высоту корпуса
        leg(P, true, wLeg(k), ph === "recovery" ? lerp(-1.4, 0.1, easeInOut(k.r)) : lerp(0.4, -1.0, wind) - 1.15 * ext,
          ph === "recovery" ? lerp(-0.9, 0.1, easeInOut(k.r)) : lerp(0.3, -0.5, wind) - 1.8 * ext, lenAt(k, 9));
        Object.assign(P, { turn, lean: ph === "active" ? -0.12 : 0.04, bodyY: ph === "startup" ? 1.5 * k.s : ph === "active" ? -0.4 : -0.4 * (1 - k.r), legSpread: 1.4, armB: 0.9, elbowB: 0.5, cloak: ph === "active" ? 1.2 : 0.3, sx: 1, sy: 1, headTilt: 0.05 });
        guard(P);
      },
    },

    /* Подбив: нога снизу вверх под подбородок на сильной доле — подбрасывает врага; герой взлетает следом. */
    liftKick: {
      name: "Подбив", startup: 0.08, active: 0.1, recovery: 0.27, cancel: 0.2, dmg: 13, knock: 40, stun: 0.7, lunge: 0, mstep: 0, limb: "n", launch: true, launchV: 320,
      fx(g, p, act) {
        kickSound(g, 1.4, 160); strikeFx(g, p, act, this, { w: 6 });
        if (p.onGround) { p.vy = -320; p.onGround = false; p.airJumps = 1; p.vx = act.dir * 110; g.addAfterimage(p); }
      },
      step(cs, p, act, dt) { if (act.phase === "startup") grounded(p, dt, 12); },
      pose(P, act, p, k) {
        const ph = act.phase;
        const up = ph === "startup" ? 0 : ph === "active" ? easeOut(Math.min(1, k.a * 1.8)) : 1 - easeInOut(Math.min(1, k.r * 1.4));
        const cock = ph === "startup" ? easeOut(k.s) : 0;
        leg(P, true, wLeg(k), lerp(-0.5 * cock, 2.45, up), lerp(-0.9 * cock + 0.1 * (1 - cock), 2.65, up), lenAt(k, 8.8));
        Object.assign(P, { lean: ph === "startup" ? 0.1 * k.s : -0.34 * (ph === "recovery" ? 1 - k.r : 1), bodyY: ph === "startup" ? 2.4 * k.s : -0.8 * up, sy: ph === "startup" ? 1 - 0.07 * k.s : 1.04, sx: 1, legSpread: 1.3, armB: -1.5, elbowB: 0.5, headTilt: -0.15, cloak: ph === "active" ? 0.8 : 0, tuck: 0 });
        guard(P);
      },
    },

    /* Колено: вплотную — подскок и удар коленом; висящего в воздухе врага догоняет прыжком. */
    kneeStrike: {
      name: "Колено", startup: 0.06, active: 0.1, recovery: 0.21, cancel: 0.14, dmg: 13, knock: 140, stun: 0.5, lunge: 130, mstep: 2, limb: "knee", chase: true,
      fx(g, p, act) { kickSound(g, 1.2, 110, 0.34); strikeFx(g, p, act, this, { w: 4, ring: 20 }); },
      step(cs, p, act, dt, tA) {
        if (act.chase) {
          if (act.phase !== "recovery") { chase(p, act, 520, 320, 6); p.onGround = false; }
        } else if (act.phase === "startup") {
          const e = act.target, gap = e ? Math.abs(e.x - p.x) - e.w * e.scale / 2 - p.w / 2 : 0;
          if (e && gap > 8 && p.onGround) p.vx = act.dir * clamp((gap - 6) / Math.max(0.03, act.startup - act.t + 0.03), 0, 300); else grounded(p, dt, 12);
        }
        else if (act.phase === "active" && !act.hopped) { act.hopped = true; if (p.onGround) { p.vy = -200; p.onGround = false; p.vx = act.dir * 110; } }
      },
      pose(P, act, p, k) {
        const ph = act.phase;
        const up = ph === "startup" ? easeOut(k.s) * 0.6 : ph === "active" ? 0.6 + 0.4 * easeOut(Math.min(1, k.a * 2)) : 1 - easeInOut(Math.min(1, k.r * 1.5));
        leg(P, true, wLeg(k), lerp(0.2, 2.25, up), lerp(0.1, -0.1, up), lenAt(k, 8.4));
        Object.assign(P, { lean: ph === "active" ? 0.3 : 0.1 * (ph === "startup" ? k.s : 1 - k.r), bodyY: ph === "startup" ? 1.5 * k.s : -0.6 * up, sy: 1, legSpread: 1.2, armB: 0.8, elbowB: 1.3, headTilt: 0.12, tuck: 0 });
        guard(P);
      },
    },

    /* Локоть: вплотную после серии. Задняя рука заведена к плечу и выбрасывается локтем вперёд поверх плаща. */
    elbow: {
      name: "Локоть", startup: 0.05, active: 0.07, recovery: 0.21, cancel: 0.14, dmg: 12, knock: 170, stun: 0.5, lunge: 90, mstep: 2, limb: "elbow",
      fx(g, p, act) { kickSound(g, 1.3, 125); g.fx.cut(p.x + act.dir * 3, p.y - 14, p.x + act.dir * 17, p.y - 13, p.skin.accent, 5, 0.18); g.fx.cut(p.x + act.dir * 3, p.y - 14, p.x + act.dir * 17, p.y - 13, "#ffffff", 1.5, 0.12); strikeFx(g, p, act, this, { w: 4, ring: 20 }); if (p.onGround) p.vx = act.dir * this.lunge; },
      step(cs, p, act, dt) {
        if (act.phase === "startup") {   // подшаг к врагу
          const e = act.target, gap = e ? Math.abs(e.x - p.x) - e.w * e.scale / 2 - p.w / 2 : 0;
          if (e && gap > 8 && p.onGround) p.vx = act.dir * clamp((gap - 6) / Math.max(0.03, act.startup - act.t + 0.03), 0, 260); else grounded(p, dt, 12);
        } else if (act.phase !== "active") grounded(p, dt, 12);
      },
      pose(P, act, p, k) {
        const ph = act.phase;
        const out = ph === "startup" ? 0 : ph === "active" ? easeOut(Math.min(1, k.a * 2)) : 1 - easeInOut(k.r);
        const cock = ph === "startup" ? easeOut(k.s) : 0;
        Object.assign(P, { armB: lerp(lerp(-0.3, -1.2, cock), 1.5, out), elbowB: lerp(lerp(0.5, 1.6, cock), 2.7, out), armFront: 1,
          lean: lerp(-0.08 * cock, 0.3, out), bodyY: 0.5 + 1.3 * out, legSpread: 1.3 + 0.8 * out, sx: 1 + 0.05 * out, sy: 1 - 0.04 * out, cloak: -0.6 * out, headTilt: 0.05 });
        guard(P, -1.4); Object.assign(P, { armF: lerp(0.55, -0.1, out), elbowF: lerp(1.9, 1.2, out) });
      },
    },

    /* Локоть с разворота: враг за спиной — герой разворачивается (turn) и бьёт локтем. */
    elbowSpin: {
      name: "Локоть с разворота", startup: 0.07, active: 0.09, recovery: 0.22, cancel: 0.15, dmg: 13, knock: 190, stun: 0.55, lunge: 80, mstep: 2, limb: "elbow",
      fx(g, p, act) { kickSound(g, 1.3, 125); g.fx.ring(p.x, p.y - 14, 6, 34, p.skin.accent, 0.22, 2.5); g.fx.cut(p.x + act.dir * 3, p.y - 14, p.x + act.dir * 17, p.y - 13, "#ffffff", 1.5, 0.12); strikeFx(g, p, act, this, { w: 4, ring: 20 }); if (p.onGround) p.vx = act.dir * this.lunge; },
      step(cs, p, act, dt) { if (act.phase !== "active") grounded(p, dt, 12); },
      pose(P, act, p, k) {
        const ph = act.phase;
        // герой уже смотрит на врага (facing сменился при выборе цели); оборот показывает «из-за спины» — от 0.5 к 1
        const turn = ph === "startup" ? 0.5 + 0.12 * easeInOut(k.s) : ph === "active" ? 0.62 + 0.38 * easeOut(k.a) : 1;
        const out = ph === "startup" ? 0 : ph === "active" ? easeOut(clamp((k.a - 0.2) * 1.6, 0, 1)) : 1 - easeInOut(k.r);
        Object.assign(P, { turn, armB: lerp(-1.0, 1.5, out), elbowB: lerp(1.5, 2.7, out), armFront: 1,
          lean: 0.1 + 0.2 * out, bodyY: 0.8 + 0.8 * out, legSpread: 1.5, cloak: ph === "startup" ? 1.2 : 0.5, sy: 1, sx: 1 });
        guard(P, -1.4); Object.assign(P, { armF: lerp(0.55, -0.1, out), elbowF: lerp(1.9, 1.2, out) });
      },
    },

    /* Подсечка: низкий удар ногой вдоль земли — сбивает замах, долго оглушает. */
    sweepKick: {
      name: "Подсечка", startup: 0.08, active: 0.1, recovery: 0.3, cancel: 0.22, dmg: 11, knock: 90, stun: 0.95, lunge: 70, mstep: 2, limb: "n", stagger: true,
      fx(g, p, act) {
        kickSound(g, 0.95, 105, 0.34); strikeFx(g, p, act, this, { w: 5, dust: false }); g.fx.dust(p.x + act.dir * 10, p.y, 7); if (p.onGround) p.vx = act.dir * this.lunge;
        for (const e of g.enemies) if (e.alive && e.state === "windup" && e.windT <= e.windDur * 0.5 && Math.abs(e.x - p.x) < 60) e.poise = Math.min(e.poise, 0.5);   // сбивает начатый замах
      },
      step(cs, p, act, dt) { if (act.phase !== "active") grounded(p, dt, 12); },
      pose(P, act, p, k) {
        const ph = act.phase;
        const sw = ph === "startup" ? 0 : ph === "active" ? easeOut(k.a) : 1 - easeInOut(Math.min(1, k.r * 1.5));
        const cr = ph === "startup" ? easeOut(k.s) : ph === "active" ? 1 : 1 - easeInOut(k.r) * 0.7;
        leg(P, true, wLeg(k), lerp(0.5, 1.5, sw), lerp(0.3, 1.55, sw), lenAt(k, 8.0));
        Object.assign(P, { bodyY: 3.8 * cr, sy: 1 - 0.14 * cr, sx: 1 + 0.06 * cr, lean: -0.1 * cr + 0.1 * sw, legSpread: 1.1, armB: 0.2, elbowB: 0.5, headTilt: 0.1 });
        guard(P, -1.1);
      },
    },

    /* Двойной удар ногами в прыжке: рывок с места, обе ноги вперёд. */
    dropKick: {
      name: "Двойной удар ногами", startup: 0.1, active: 0.24, recovery: 0.3, cancel: 0.24, dmg: 20, knock: 380, stun: 0.55, mstep: 2, limb: "nf", moveControl: 0,
      fx(g, p, act) {
        g.sfx("dash"); kickSound(g, 1.1, 140, 0.34); strikeFx(g, p, act, this, { w: 6, ring: 28 }); g.addAfterimage(p);
        if (p.onGround) { p.vx = act.dir * 560; p.vy = -190; p.onGround = false; }
      },
      step(cs, p, act, dt) {
        if (act.phase === "startup") grounded(p, dt, 14);
        else if (act.phase === "active") { if (act.hit.size && !act.bounced) { act.bounced = true; p.vx = -act.dir * 70; } if (cs.game.player.vy > -50) cs.game.addAfterimage(p); }
        else if (p.onGround) grounded(p, dt, 9);
      },
      pose(P, act, p, k) {
        const ph = act.phase;
        const ext = ph === "startup" ? 0 : ph === "active" ? easeOut(Math.min(1, k.a * 3)) : 1 - easeInOut(Math.min(1, k.r * 1.6));
        const crouch = ph === "startup" ? easeOut(k.s) : 0;
        const w = ph === "startup" ? 0 : wLeg(k);
        leg(P, true, w, lerp(0.3, 1.6, ext), lerp(0.2, 1.9, ext), lenAt(k, 8.6));
        leg(P, false, w, lerp(0.2, 1.3, ext), lerp(0.1, 1.6, ext), lenAt(k, 8.2));
        Object.assign(P, { lean: ph === "startup" ? 0.12 * k.s : -0.4 * ext, bodyY: 3 * crouch - 0.5 * ext, sy: 1 - 0.1 * crouch, sx: 1 + 0.05 * crouch, armB: -1.7 * ext, elbowB: 0.4, cloak: -0.9 * ext, headTilt: -0.1 * ext, tuck: 0 });
        guard(P, lerp(-1.25, -1.6, ext));
      },
    },

    /* Колено в воздухе: звено джагла — подлетает к висящему врагу и бьёт коленом. */
    airKnee: {
      name: "Колено в воздухе", startup: 0.04, active: 0.09, recovery: 0.15, cancel: 0.1, dmg: 11, knock: 50, stun: 0.45, mstep: 0, limb: "knee", moveControl: 0,
      fx(g, p, act) { kickSound(g, 1.25, 120, 0.3); strikeFx(g, p, act, this, { w: 4, ring: 20, dust: false }); },
      step(cs, p, act) { if (act.phase !== "recovery") chase(p, act, 520, 280, 2); },
      pose(P, act, p, k) {
        const ph = act.phase;
        const up = ph === "startup" ? easeOut(k.s) * 0.6 : ph === "active" ? 0.6 + 0.4 * easeOut(Math.min(1, k.a * 2)) : 1 - easeInOut(Math.min(1, k.r * 1.5));
        leg(P, true, wLeg(k), lerp(0.3, 2.25, up), lerp(0.2, -0.1, up), lenAt(k, 8.4));
        leg(P, false, wLeg(k) * 0.9, 0.5, -0.5, 5.2);
        Object.assign(P, { lean: 0.22 * up, bodyY: 0, armB: 0.8, elbowB: 1.3, tuck: 0, cloak: 0.5, headTilt: 0.1 });
        guard(P);
      },
    },

    /* Нога в воздухе: прямой удар ногой вперёд-вверх по висящему врагу. */
    airKick: {
      name: "Нога в воздухе", startup: 0.05, active: 0.09, recovery: 0.15, cancel: 0.1, dmg: 12, knock: 60, stun: 0.45, mstep: 0, limb: "n", moveControl: 0,
      fx(g, p, act) { kickSound(g, 1.3, 135); strikeFx(g, p, act, this, { w: 5, dust: false }); },
      step(cs, p, act) { if (act.phase !== "recovery") chase(p, act, 520, 280, 0); },
      pose(P, act, p, k) {
        const ph = act.phase;
        const ext = ph === "startup" ? 0 : ph === "active" ? easeOut(Math.min(1, k.a * 2.2)) : 1 - easeInOut(Math.min(1, k.r * 1.6));
        const ch = ph === "startup" ? easeOut(k.s) : 1;
        leg(P, true, wLeg(k), lerp(0.4, 1.95, ch) + 0.3 * ext, lerp(0.1, 0.0, ch) + 2.2 * ext, lenAt(k, 8.8));
        leg(P, false, wLeg(k) * 0.9, 0.5, -0.4, 5.2);
        Object.assign(P, { lean: -0.2 * ch, bodyY: 0, armB: -1.2, elbowB: 0.5, tuck: 0, cloak: 0.4, headTilt: -0.05 });
        guard(P);
      },
    },

    /* Топор-кик: финал джагла. Нога поднята над головой и рубит сверху вниз, герой падает вместе с врагом — враг вбит в землю. */
    axeKick: {
      name: "Топор-кик", startup: 0.1, active: 0.5, recovery: 0.24, cancel: 0.2, dmg: 17, knock: 110, stun: 0.6, mstep: 0, limb: "n", smash: true, moveControl: 0,
      fx(g, p, act) { g.sfx("slam"); kickSound(g, 0.9, 100, 0.4); strikeFx(g, p, act, this, { w: 7, ring: 30 }); g.camera.kick(0.012); },
      step(cs, p, act, dt, tA) {
        const e = act.target;
        if (act.phase === "startup") {
          if (e && e.alive) { chase(p, act, 520, 0, -28); p.vx = clamp((e.x - p.x) * 10, -300, 300); }      // выше врага: оттуда нога рубит вниз
          else p.vy = damp(p.vy, -60, 10, dt);
        } else if (act.phase === "active") {
          act.noGravity = true; act.iframes = false;
          p.vy = 640;
          p.vx = e && e.alive && !act.smashed ? clamp((e.x - p.x) * 8, -260, 260) : damp(p.vx, 0, 8, dt);
          if (act.hit.size) act.smashed = true;
          if (p.onGround) { act.t = tA + act.active; cs.game.fx.dust(p.x, p.y, 6); cs.game.camera.shake(0.12); }
        } else { act.noGravity = false; if (p.onGround) grounded(p, dt, 10); }
      },
      pose(P, act, p, k) {
        const ph = act.phase;
        const chop = ph === "active" ? easeIn(Math.min(1, k.a * 4)) : ph === "recovery" ? 1 : 0;
        const raise = ph === "startup" ? easeOut(k.s) : 1;
        leg(P, true, wLeg(k) * (ph === "startup" ? raise : 1), lerp(0.3, 2.5, raise) - 2.0 * chop, lerp(0.2, 2.6, raise) - 2.25 * chop, lenAt(k, 8.8));
        leg(P, false, 0.8 * wLeg(k), 0.2, -0.7, 5.2);
        // свободная рука согнута и прижата к корпусу (раньше торчала прямой палкой назад-вверх)
        Object.assign(P, { lean: lerp(-0.1, -0.32, raise) * (1 - chop) + 0.3 * chop, bodyY: 0, armB: lerp(-0.2, -0.75, raise) + 1.0 * chop, elbowB: lerp(1.4, 1.9, raise), tuck: 0, cloak: -0.4 + 1.2 * chop, headTilt: -0.12 * raise, sy: 1 + 0.08 * chop, sx: 1 - 0.05 * chop });
        guard(P, -1.25 + 0.5 * chop);
      },
    },
  };

  for (const name in MOVES) {
    const d = MOVES[name];
    d.kind = "custom"; d.martial = true; d.reach = 20;
    d.update = mstep(d);
    d.hitBox = (p, act) => limbBox(d, p, act);
    ATTACKS[name] = d;
    if (!COMBO_MOVES.includes(name)) COMBO_MOVES.push(name);
  }

  /* ---------- выбор приёма ---------- */
  const PLAIN_G = { slash1: 1, slash2: 1, slash3: 1, thrust: 1, rise: 1, dash: 1 };      // обычные приёмы земли: их можно подменить
  const PLAIN_A = { airSlash: 1, airSpin: 1, meteor: 1, dive: 1 };                        // и воздуха
  const RANGED_A = { shot: 1, twin: 1, hip: 1, charged: 1, fan: 1 };                      // простые выстрелы в воздухе: у висящего врага джагл важнее
  /** Чередование на «развилке»: первый раз рукопашный, затем n−1 раз обычный приём (счётчик по развилкам — детерминированно). */
  const alt = (cs, key, n = 2) => { const m = cs.mAlt || (cs.mAlt = {}); const c = m[key] || 0; m[key] = c + 1; return c % n === 0; };

  /** Подмена выбранного приёма рукопашным (или null). cur — то, что выбрала общая логика и набор оружия. */
  martialChooseFn = function (cs, cur, target, j) {
    const g = cs.game, p = g.player;
    if (cs.martialOff || g.settings.v.martial === false) return null;
    if (cs.mForce && ATTACKS[cs.mForce]) return cs.mForce;     // для тестов: принудительный рукопашный приём
    if (!target) {
      // удар «в воздух» (врагов рядом нет): серия всё равно чередует клинок и ногу — приёмы выглядят одинаково с любым исходом
      if (!p.onGround || !PLAIN_G[cur] || j.rating === "miss") return null;
      const st = cs.time - cs.lastMeleeT < 0.75 ? cs.comboStep : 0;
      if (st === 1 && alt(cs, "s1n", 5) !== 4) return "kickFront";
      if (st === 2 && alt(cs, "s2n", 2)) return j.strong ? "roundKick" : "kneeStrike";
      return null;
    }
    const e = target, air = !p.onGround;
    const good = j.rating === "perfect" || j.rating === "good";
    const gap = Math.abs(e.x - p.x) - e.w * e.scale / 2 - p.w / 2;
    const dyc = e.centerY - p.centerY;                         // < 0 — враг выше героя
    const hang = !e.onGround && e.jugT > 0 && e.kind !== "brute";   // враг висит в воздухе (джагл)
    const recent = cs.time - cs.lastMeleeT < 0.75;
    const step = recent ? cs.comboStep : 0;
    const dxc = Math.abs(e.x - p.x);

    if (air) {
      if (!PLAIN_A[cur] && !(RANGED_A[cur] && hang)) return null;
      if (hang && dxc < 110 && Math.abs(dyc) < 90) {
        // звенья джагла по числу воздушных ударов: колено → (нога | клинок) → … → Топор-кик
        if (e.jugN >= 3) return good ? "axeKick" : "airKick";
        if (e.jugN <= 1) return "airKnee";
        return alt(cs, "air2") ? "airKick" : (PLAIN_A[cur] && cur !== "meteor" && cur !== "dive" ? cur : "airSlash");
      }
      // враг рядом на одной высоте — нога вместо воздушного клинка (через раз)
      if (!hang && (cur === "airSlash" || cur === "airSpin") && dxc < 80 && Math.abs(dyc) < 45 && j.rating !== "miss" && alt(cs, "airk", 2)) return "airKick";
      // враг ниже героя: «Топор-кик» вместо падения-пике / метеора
      if (!PLAIN_A[cur]) return null;
      if (!hang && dyc > 22 && dxc < 60 && good && (cur === "dive" || cur === "meteor") && e.kind !== "brute" && alt(cs, "axeAir")) return "axeKick";
      return null;
    }

    if (!PLAIN_G[cur]) return null;                            // комбинации и приёмы наборов оружия не трогаем
    // висящий в воздухе враг выше героя — подскок и колено
    if (hang && dyc < -20 && dxc < 130) return "kneeStrike";
    const ok = j.rating !== "miss";                            // нога бьёт и при неточном нажатии (в сильные доли и подсечку — только точные)
    const pick = (a, b) => { const r = a === cs.mLast && b ? b : a; cs.mLast = r; return r; };   // не одно и то же подряд
    if (Math.abs(dyc) < 40 && gap <= 44) {
      // враг за спиной — разворот и локоть
      if (sign(e.x - p.x) !== p.facing && gap <= 40) return pick("elbowSpin");
      // враг в замахе — подсечка сбивает его
      if (good && e.state === "windup" && e.windT <= e.windDur * 0.5 && gap <= 30) return pick("sweepKick");
      const canLaunch = e.kind !== "brute" && e.jugCD <= 0 && cs.time - cs.lastRiseT > 2;
      if (j.strong && good) {
        if (step === 2) return pick(canLaunch && !alt(cs, "strong3") ? "liftKick" : "roundKick");
        if (cur === "rise") return canLaunch && alt(cs, "rise") ? pick("liftKick") : pick("roundKick");
        if (step === 1 && gap <= 36) return pick(gap <= 16 ? "kneeStrike" : "kickFront");
        return null;
      }
      const slash = cur === "slash1" || cur === "slash2" || cur === "slash3" || cur === "thrust";
      if (!slash) return null;
      // серия: клинок → нога → клинок → колено/локоть/подсечка …; в начале серии — подшаг и фронт-кик с места
      if (step === 0) {
        if (ok && gap > 14 && alt(cs, "open", 3) === 0) return pick("kickFront", "kneeStrike");
        if (good && gap <= 16 && alt(cs, "openK", 3) === 0) return pick("kneeStrike", "elbow");
        return null;
      }
      if (step === 1) return ok && alt(cs, "s1", 5) !== 4 ? pick(gap <= 14 ? "kneeStrike" : "kickFront", gap <= 14 ? "elbow" : "kneeStrike") : null;
      if (good && step === 2 && alt(cs, "s2", 2)) return pick(gap <= 20 ? "elbow" : "sweepKick", "kickFront");
      return null;
    }
    // средняя дистанция вместо рывка — подшаг с фронт-киком или двойной удар ногами в прыжке
    if (cur === "dash" && ok && !hang && Math.abs(dyc) < 40) {
      if (gap <= 60 && alt(cs, "mid", 3) !== 2) return pick("kickFront", "dropKick");
      if (good && gap >= 50 && gap <= 140 && alt(cs, "drop", 3) === 0) return pick("dropKick");
    }
    return null;
  }
}
