/* =====================================================================
   Наборы клинков (12d_kits): kusari «Цепной серп», katana «Багровая катана», dagger «Теневой кинжал».
   У каждого оружия свои:
     • анимации ВСЕХ атак (kit.pose): кусаригама — серп в руке и ДЛИННАЯ цепь с грузом (до 172 ед.; цепь рисует
       WEAPON_DRAW.kusari по точке груза p.kuX/kuY — chainSet), катана — стойка иай (саябики, рука у рукояти), выхватывающие
       разрезы, тибури и ното, оборот корпуса в круговом разрезе (параметр позы turn), кинжал — обратный хват, низкая стойка,
       короткие уколы, перехват клинка, поворот корпуса вместо сплющивания;
     • комбинации (kit.moves + kit.choose), условие — в ритме:
         Бросок груза (kusariLash)   — основной дальний удар вместо рывка (расстояние 46–205): груз раскручен над головой и летит
                                       по прямой, бьёт всех на линии цепи (не комбинация — подпись не показывается);
         Маятник (kusariPendulum)    — сильная доля + точно, дальше 46: груз дугой сверху вниз, удар по земле с ударной волной;
         Обмотка (kusariWrap)        — сильная доля + perfect, до 150, не громила: цепь обвивает врага и перебрасывает через голову,
                                       приземление за спиной на «и»;
         Цепной захват (kusariGrab)  — perfect, дальше 70: цепь обвивает врага и подтягивает к герою;
         Вихрь цепи (kusariWhirl)    — сильная доля вплотную (место подброса): цепь по кругу радиусом 76, втягивает и бьёт всех;
         Иай (katanaIai)             — сильная доля после паузы (≥ 1,1 доли без ударов): рывок сквозь цель, «щелчок» ножен на следующей доле;
         Танец лепестков (katanaPetals) — сильная доля в потоке ударов вплотную: 4 разреза на четвертях доли;
         Ласточка (katanaSwallow)    — «и» после удара в долю (вместо «Шквала»): разрез сверху вниз и тут же обратный снизу вверх;
         Теневой шаг (daggerStep)    — perfect на средней дистанции: исчезает и бьёт со спины;
         Веер ножей (daggerKnives)   — хорошее нажатие издалека: три метательных ножа веером;
         Вихрь теней (daggerWhirl)   — сильная доля вплотную при груве ≥ 1 (вместо подброса): два круговых удара, оборот корпуса;
     • своё добивание на каждое оружие (рассечение — на земле; в воздухе и громила — встроенные sky/colossus):
         katanaIai «ОДИН ВЗМАХ», kusariCoil «ЦЕПНЫЕ ОКОВЫ» (бросок цепи, витки, рывок, мах через голову, удар о землю),
         daggerFlurry «ТЕНЕВАЯ ПЛЯСКА».
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

  /* ---------- кусаригама: длинная цепь ---------- */
  // Цепь (WEAPON_DRAW.kusari, 12b_weapons) рисуется от кольца рукояти серпа до груза; позы приёмов задают положение груза
  // относительно кисти в осях «вперёд/вниз» (chainSet). Длина цепи — 172 ед., как дальность рывка: основные удары дальние
  // (груз бросается в цель), а серп работает вблизи. Все хитбоксы — по тому месту, где груз и цепь нарисованы.
  const KU_L = 172;
  const KU_E = { x: 0, y: 0 }, KU_W = { x: 0, y: 0 }, KU_T = { x: 0, y: 0 };     // временные точки (без аллокаций в кадре)
  const KU_WIND = 0.045;                  // время полёта груза до удара (с)
  const chainSet = (p, x, y, bend, sag, w) => { p.kuX = x; p.kuY = y; p.kuB = bend; p.kuS = sag; p.wExt = w == null ? 1 : w; };
  /** Мировая точка → относительно кисти в осях цепи (вперёд по взгляду, вниз). */
  const toLocal = (p, wx, wy, o) => { const h = CharacterRenderer.handWorld(p, 0); o.x = (wx - h.x) * p.facing; o.y = wy - h.y; return o; };
  /** Эллиптическая орбита груза (вид «в три четверти»): над головой или вокруг героя. */
  const orbit = (o, cx, cy, rx, ry, th) => { o.x = cx + rx * Math.cos(th); o.y = cy + ry * Math.sin(th); return o; };
  /** Груз летит к точке E: раскрутка над головой до s = −KU_WIND, затем бросок; к удару (s = 0) груз у цели. */
  const castChain = (p, s, E, w) => {
    if (s < -KU_WIND) { orbit(KU_W, 0, -2, 25, 8, -2.4 + 24 * (s + KU_WIND)); chainSet(p, KU_W.x, KU_W.y, -6, 2, w); }
    else {
      const f = easeIn((s + KU_WIND) / KU_WIND);        // 1 к моменту удара — груз у цели
      orbit(KU_W, 0, -2, 25, 8, -2.4);
      chainSet(p, lerp(KU_W.x, E.x, f), lerp(KU_W.y, E.y, f), lerp(-6, 0, f), lerp(2, 5, f), w);
    }
  };
  /** Втягивание цепи: груз по земле возвращается к ногам, звенья провисают, в конце цепь складывается в петлю на поясе. */
  const reelChain = (p, E, r, w) => {
    const gv = p.y - CharacterRenderer.handWorld(p, 0).y - 2;
    const e = easeInOut(r);
    chainSet(p, lerp(E.x, 16, e), r < 0.5 ? lerp(E.y, gv, Math.min(1, r * 3)) : lerp(gv, 12, easeInOut((r - 0.5) / 0.5)), 0, 3 + 9 * Math.sin(Math.PI * r), w * (1 - easeInOut((r - 0.62) / 0.38)));
  };
  /** Отрезок цепи (x0,y0)-(x1,y1) пересекает врага (прямоугольник с запасом pad)? */
  const segHit = (x0, y0, x1, y1, e, pad) => {
    const b = { x: e.x - e.w * e.scale / 2 - pad, y: e.y - e.h * e.scale - pad, w: e.w * e.scale + pad * 2, h: e.h * e.scale + pad * 2 };
    const t = rayBox(x0, y0, x1 - x0, y1 - y0, b);
    return t >= 0 && t <= 1;
  };
  /** Удар цепью по всем врагам на отрезке (каждого один раз за приём). Возвращает число попаданий. */
  const chainHits = (cs, p, act, x0, y0, x1, y1, pad) => {
    let n = 0;
    for (const e of cs.game.enemies) {
      if (!e.targetable || act.hit.has(e.id) || !segHit(x0, y0, x1, y1, e, pad)) continue;
      act.hit.add(e.id); n++;
      cs._applyHit(e, act, sign(e.x - p.x) || act.dir, e.x, e.centerY);
    }
    return n;
  };
  /** Вспышка рывка цепи: тонкая линия с белой сердцевиной и пятно на грузе. */
  const snapFx = (g, p, x0, y0, x1, y1, hit) => {
    g.fx.cut(x0, y0, x1, y1, "#9aa3b5", 2.4, 0.14);
    g.fx.cut(x0, y0, x1, y1, "#ffffff", 0.9, 0.1);
    g.fx.glow(x1, y1, 3, hit ? 18 : 10, p.skin.accent, 0.16, hit ? 0.45 : 0.25);
    if (hit) g.fx.sparks(x1, y1, 5, p.skin.accent, 170, null, Math.PI, 0.25);
  };
  /** След груза: короткие росчерки между положениями груза (по ходу вращения и броска). */
  const trail = (g, p, act) => {
    if (!p.wExt || g.fx.low) return;
    const h = CharacterRenderer.handWorld(p, 0), x = h.x + (p.kuX || 0) * p.facing, y = h.y + (p.kuY || 0);
    if (act.kpx != null) {
      const d = Math.hypot(x - act.kpx, y - act.kpy);
      if (d > 10) { if (d < 140) g.fx.line(act.kpx, act.kpy, x, y, p.skin.accent, 1.8, 0.13); act.kpx = x; act.kpy = y; }
    } else { act.kpx = x; act.kpy = y; }
  };
  /** Шаг героя навстречу цели в подготовке, чтобы цепь доставала (скорость — чтобы успеть к удару). */
  const stepIn = (p, act, dt, tA, need) => {
    if (act.stepNeed == null) { act.stepNeed = need; act.stepX = p.x; }
    const left = act.stepNeed - Math.abs(p.x - act.stepX), rem = Math.max(0.03, tA - act.t);
    if (act.phase !== "active" && act.phase !== "recovery" && left > 1) p.vx = act.dir * Math.min(900, left / rem);
    else p.vx = damp(p.vx, 0, 12, dt);
  };
  /** Точка и сторона цели: враг в act.target (или ближайший); вне досягаемости цепи — груз падает коротко. */
  const kuTarget = (cs, p, act) => {
    const g = cs.game, tg = act.target && act.target.targetable ? act.target : nearestEnemy(g, p, 230);
    const hand = CharacterRenderer.handWorld(p, 0);
    let ex, ey;
    if (tg) { act.dir = sign(tg.x - p.x) || act.dir; p.facing = act.dir; ex = tg.x; ey = tg.centerY; }
    else { ex = hand.x + act.dir * 125; ey = hand.y + 6; }
    const d = Math.hypot(ex - hand.x, ey - hand.y);
    if (d > KU_L) { ex = hand.x + (ex - hand.x) * KU_L / d; ey = hand.y + (ey - hand.y) * KU_L / d; }
    act.Ex = ex; act.Ey = ey; act.tg = tg;
    return hand;
  };
  /** Предполагаемая точка удара до броска (оси цепи) — груз летит к цели, даже пока она движется. */
  const kuEnd = (act, p, o) => {
    if (act.fired) return toLocal(p, act.Ex, act.Ey, o);
    const tg = act.target;
    if (tg && tg.targetable) toLocal(p, tg.x, tg.centerY, o); else { o.x = 120; o.y = 2; }
    const d = Math.hypot(o.x, o.y);
    if (d > KU_L) { o.x *= KU_L / d; o.y *= KU_L / d; }
    return o;
  };

  // w0 — угол серпа в замахе, w1 — в конце взмаха (0 — вперёд, −π/2 — вверх, π/2 — вниз); a0/a1 — угол руки
  const KUS = {
    slash1: { w0: -2.2, w1: 0.55, a0: 2.7, a1: 1.5 },
    slash2: { w0: 2.5, w1: -0.55, a0: 0.1, a1: 1.8 },
    slash3: { w0: -1.6, w1: -1.6 + TAU * 1.5, a0: 2.5, a1: 1.8, spin: true },
    thrust: { w0: -0.35, w1: 0.05, a0: -0.2, a1: 1.57, straight: true },
    rise:   { w0: 1.3, w1: -2.6, a0: 0.3, a1: 2.9 },
    cross:  { w0: -2.0, w1: 0.6, a0: 2.5, a1: 1.5 },
  };
  /** Удары серпом вблизи (обычные приёмы, «Крест», «Шквал»): серп бьёт, цепь хвостом тянется за взмахом и стекает вниз. */
  const kusariPose = (P, act, p, k) => {
    if (act.def.kit) return;                      // у своих приёмов набора — своя поза
    const nm = BASE[act.name] || act.name;
    if (SKIP[nm]) { p.wExt = 0; return; }
    const S = KUS[nm] || KUS.slash1, ph = act.phase, g = ground(p), { h, s, u } = subOf(act, k);
    const kb = baseAng(act, p, S.w0);
    const sI = act.t - act.startup - act.travel;
    let w = S.w0, arm = S.a0, q = 0;
    if (ph === "startup") {
      // раскрутка цепи над головой: оборот-полтора, к концу подготовки серп встаёт в угол замаха
      const e = easeOut(k.s);
      arm = lerp(1.0, S.a0, e);
      w = S.w0 - (S.straight ? 0.6 : TAU * 1.5) * (1 - e);
      Object.assign(P, { lean: -0.14 * k.s, armB: lerp(-0.3, -1.3, e), elbowF: 0.25 });
      if (g) Object.assign(P, { bodyY: 0.5 + 1.8 * e, legSpread: 1.3 + 0.5 * e });
    } else if (ph === "travel") {
      w = S.w0; arm = S.a0;
    } else if (ph === "active") {
      q = easeOut(k.a); let a0 = S.w0, a1 = S.w1;
      if (h > 1 && !S.spin && !S.straight) { q = easeOut(u); if (s % 2) { a0 = S.w1; a1 = S.w0; } }     // «Крест»: туда и обратно
      w = lerp(a0, a1, q);
      arm = lerp(s % 2 && h > 1 ? S.a1 : S.a0, s % 2 && h > 1 ? S.a0 : S.a1, q);
      if (S.straight && h > 1) { arm = 1.57; w = lerp(-0.25, 0.1, u); q = Math.sin(Math.PI * Math.min(1, u * 1.5)); }
      P.armB = lerp(-1.3, 0.6, q);       // вторая рука идёт навстречу цепи
      P.elbowF = 0.1;
      if (g) Object.assign(P, { legSpread: 1.8, bodyY: 2 });
    } else {
      // доводка: рука опускается, цепь стекает вниз и собирается в петлю, серп возвращается к бедру
      const e = easeInOut(k.r), w1 = S.w1;
      w = lerp(w1, w1 + wrapPi(1.25 - w1), e);
      arm = lerp(S.a1, 0.6, e);
      P.armB = lerp(0.6, -0.4, e);
    }
    Object.assign(P, { armF: arm, wBlend: 1, wAngle: kb + (w - S.w0) });
    // цепь: до удара — петля над головой, в ударе — хвост за серпом, на доводке — стекает вниз
    const lean = P.lean || 0, ac = clamp((act.t - act.startup - act.travel) / 0.04, 0, 1);
    orbit(KU_W, 0, -2, 18, 6, -1.6 + 20 * sI);
    if (ph === "startup" || ph === "travel") { chainSet(p, KU_W.x, KU_W.y, -4, 2, clamp(act.t / 0.04, 0, 1)); p.kuLen = 26; }
    else if (!p.kuSim || !p.kuSim.ok) {
      // без физики груза (листы кадров): хвост цепи за серпом по позе
      const dirS = S.spin ? 1 : Math.sign(S.w1 - S.w0) || 1, R = ph === "active" ? 22 + 30 * Math.sin(Math.PI * Math.min(1, q)) : lerp(36, 10, easeInOut(k.r));
      const ph0 = S.straight ? 0 : w + lean - 0.75 * dirS, ty = S.straight ? 4 : R * Math.sin(ph0) * 0.85, tx = S.straight ? 20 + 36 * (ph === "active" ? q : 1 - k.r) : R * Math.cos(ph0);
      chainSet(p, lerp(KU_W.x, tx, easeOut(ac)), lerp(KU_W.y, ty, easeOut(ac)), -4, ph === "recovery" ? 3 + 9 * Math.sin(Math.PI * k.r) : 2, ph === "recovery" ? 1 - easeInOut((k.r - 0.5) / 0.5) : 1);
    } else if (ph === "active") {
      // удар серпом: груз отпущен с орбиты (kusariSim) — летит по инерции, цепь вытравливается и хлещет за взмахом
      p.wExt = 1 - easeOut(clamp(k.a * 2.2, 0, 1));
      p.kuLen = S.straight ? 46 : S.spin ? 40 : 34;
      // хлёст: груз срывается с орбиты по направлению взмаха (вперёд; вихрь — по кругу назад и вверх, «Крест» — каждым ударом)
      if (act.kuKick !== s + 1) {
        act.kuKick = s + 1;
        const up = S.straight ? -60 : nm === "rise" ? -620 : S.spin ? -420 : (s % 2 ? -380 : 160);
        const fw = S.straight ? 640 : S.spin ? (s % 2 ? 420 : -380) : 520;
        p.kuKick = [p.facing * fw, up];
      }
    } else {
      // доводка: цепь выбирается — груз подтягивается к руке и повисает
      p.wExt = 0;
      p.kuLen = lerp(S.spin ? 40 : 32, 9, easeInOut(k.r));
    }
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
    // ДАЛЬНИЙ УДАР (основной у кусаригамы вместо рывка): груз раскручивается над головой и летит по прямой в цель, цепь
    // провисает и натягивается; бьёт всех на линии цепи. Герой стоит на месте (или подаётся шагом вперёд), потом втягивает цепь.
    kusariLash: {
      kind: "custom", name: "Бросок груза", startup: 0.1, active: 0.1, recovery: 0.27, cancel: 0.2,
      dmg: 15, knock: 230, stun: 0.4, moveControl: 0.1,
      pose(P, act, p, k) {
        const ph = act.phase, s = act.t - act.startup - act.travel, w = clamp(act.t / 0.04, 0, 1), E = kuEnd(act, p, KU_E);
        const cast = s > -KU_WIND ? easeIn((s + KU_WIND) / KU_WIND) : 0, raise = easeOut(k.s);
        if (ph === "startup" || ph === "travel") {
          Object.assign(P, { armF: lerp(lerp(1.0, 2.7, raise), 1.55, cast), elbowF: lerp(0.25, 0.08, cast), wBlend: 1, wAngle: lerp(-1.3, 0.1, cast), lean: lerp(-0.2 * raise, 0.3, cast), armB: lerp(-0.3, -0.9, raise), bodyY: 0.5 + 1.7 * raise, legSpread: 1.3 + 0.6 * raise, sx: 1 + 0.06 * cast, sy: 1 - 0.06 * cast });
          castChain(p, s, E, w);
        } else if (ph === "active") {
          Object.assign(P, { armF: 1.55, elbowF: 0.08, wBlend: 1, wAngle: 0.1, lean: 0.38, armB: -0.8, bodyY: 2.2, legSpread: 1.9, sx: 1.1, sy: 0.93, cloak: -0.8 });
          chainSet(p, E.x, E.y, 0, lerp(5, 1, easeOut(k.a)), 1);
        } else {
          const e = easeInOut(k.r);
          Object.assign(P, { armF: lerp(1.55, 0.7, e), elbowF: lerp(0.08, 0.5, e), wBlend: 1, wAngle: lerp(0.1, 1.0, e), lean: lerp(0.3, 0.05, e), armB: lerp(-0.8, -0.3, e), bodyY: lerp(2.2, 0.6, e), legSpread: lerp(1.9, 1.3, e) });
          reelChain(p, E, k.r, 1);
        }
      },
      update(cs, p, act, dt, tA) {
        const g = cs.game;
        if (act.stepNeed == null && act.target) stepIn(p, act, dt, tA, clamp(Math.abs(act.target.x - p.x) - 120, 0, 90));
        else stepIn(p, act, dt, tA, 0);
        trail(g, p, act);
        if (act.phase === "active" && !act.fired) {
          act.fired = true;
          const hand = kuTarget(cs, p, act);
          const n = chainHits(cs, p, act, hand.x, hand.y, act.Ex, act.Ey, 7);
          snapFx(g, p, hand.x, hand.y, act.Ex, act.Ey, n > 0);
          g.sfx("slash", 1.25);
          if (n) g.camera.kick(0.008);
        }
      },
    },
    // сильная доля, точно: груз раскручен высоко над головой и обрушивается дугой сверху вниз — удар по земле с ударной
    // волной; бьёт всё в точке приземления
    kusariPendulum: {
      kind: "custom", name: "Маятник", startup: 0.1, active: 0.1, recovery: 0.3, cancel: 0.22,
      dmg: 24, knock: 280, stun: 0.55, moveControl: 0.1,
      pose(P, act, p, k) {
        const ph = act.phase, s = act.t - act.startup - act.travel, w = clamp(act.t / 0.04, 0, 1), SW = 0.1;
        const gv = p.y - CharacterRenderer.handWorld(p, 0).y - 1;
        // точка приземления: до броска — по цели, после — где упал груз
        const E = kuEnd(act, p, KU_E), lx = clamp(Math.abs(E.x) < 40 ? 40 : E.x, 40, KU_L - 12), rf = Math.hypot(lx, gv), phE = Math.atan2(gv, lx);
        const raise = easeOut(k.s), u = s > -SW ? (s + SW) / SW : 0, sw = easeIn(u);
        if (ph === "startup" || ph === "travel") {
          Object.assign(P, { armF: lerp(lerp(1.0, 2.8, raise), 1.25, sw), elbowF: lerp(0.25, 0.08, sw), wBlend: 1, wAngle: lerp(-1.4, 0.35, sw), lean: lerp(-0.26 * raise, 0.5, sw), armB: lerp(-0.3, -1.1, raise), bodyY: 0.5 + 2.2 * raise, legSpread: 1.3 + 0.7 * raise, cloak: lerp(0, -1, sw) });
          // сначала груз раскручен позади-над головой, затем дуга через верх вперёд-вниз; радиус растёт к концу дуги
          const phi = lerp(-2.7, phE, sw), r = lerp(36, rf, Math.pow(sw, 1.6)), fy = lerp(0.45, 1, sw), th = s < -SW ? -2.7 + 18 * (s + SW) : phi;
          if (s < -SW) orbit(KU_W, 0, -4, 30, 13, th); else { KU_W.x = r * Math.cos(phi); KU_W.y = fy * r * Math.sin(phi) - (1 - fy) * 4; }
          chainSet(p, KU_W.x, KU_W.y, lerp(-6, 4, sw), lerp(2, 0, sw), w);
        } else if (ph === "active") {
          Object.assign(P, { armF: 1.25, elbowF: 0.08, wBlend: 1, wAngle: 0.35, lean: 0.5, armB: -1.1, bodyY: 3, legSpread: 2.0, sx: 1.1, sy: 0.92, cloak: -1 });
          chainSet(p, lx, gv - 3 * Math.max(0, 1 - k.a * 4), 0, 3, 1);
        } else {
          const e = easeInOut(k.r);
          Object.assign(P, { armF: lerp(1.25, 0.7, e), elbowF: lerp(0.08, 0.5, e), wBlend: 1, wAngle: lerp(0.35, 1.0, e), lean: lerp(0.5, 0.05, e), armB: lerp(-1.1, -0.3, e), bodyY: lerp(3, 0.6, e), legSpread: lerp(2, 1.3, e) });
          KU_T.x = lx; KU_T.y = gv - 2; reelChain(p, KU_T, k.r, 1);
        }
      },
      update(cs, p, act, dt, tA) {
        const g = cs.game, def = act.def;
        stepIn(p, act, dt, tA, act.target ? clamp(Math.abs(act.target.x - p.x) - 120, 0, 70) : 0);
        trail(g, p, act);
        if (act.phase === "active" && !act.fired) {
          act.fired = true;
          const hand = kuTarget(cs, p, act);
          const lx = hand.x + act.dir * clamp(Math.abs(act.Ex - hand.x), 40, KU_L - 12);
          act.Ex = lx; act.Ey = p.y - 2;
          g.fx.shockwave(lx, p.y, p.skin.accent, 170);
          g.fx.ring(lx, p.y - 4, 5, 46, "#ffffff", 0.28, 2.6);
          g.fx.sparks(lx, p.y, 9, p.skin.accent, 280, -Math.PI / 2, 2.4, 0.4);
          g.fx.dust(lx, p.y, g.fx.low ? 4 : 9);
          g.fx.cut(hand.x, hand.y, lx, p.y - 2, "#9aa3b5", 2.2, 0.14);
          g.camera.shake(0.2); g.camera.kick(0.012);
          g.sfx("slam", 1);
          for (const e of g.enemies) {
            if (!e.targetable || act.hit.has(e.id)) continue;
            if (Math.abs(e.x - lx) > 34 + e.w * e.scale / 2 || Math.abs(e.y - p.y) > 40) continue;
            act.hit.add(e.id);
            cs._applyHit(e, act, sign(e.x - p.x) || act.dir, e.x, e.centerY);
          }
        }
      },
    },
    // точное нажатие на средней/дальней дистанции: груз обвивает врага, цепь натягивается и рывком подтягивает его к
    // герою (подтягивание — после удара). Бросок — на доле
    kusariGrab: {
      kind: "custom", name: "Цепной захват", startup: 0.1, active: 0.2, recovery: 0.26, cancel: 0.2,
      dmg: 20, knock: 0, stun: 0.9, moveControl: 0.1,
      pose(P, act, p, k) {
        const ph = act.phase, s = act.t - act.startup - act.travel, w = clamp(act.t / 0.04, 0, 1), E = kuEnd(act, p, KU_E);
        const raise = easeOut(k.s), cast = s > -KU_WIND ? easeIn((s + KU_WIND) / KU_WIND) : 0;
        if (ph === "startup" || ph === "travel") {
          Object.assign(P, { armF: lerp(lerp(1.0, 2.6, raise), 1.6, cast), elbowF: lerp(0.25, 0.08, cast), wBlend: 1, wAngle: lerp(-1.3, -0.05, cast), lean: lerp(-0.2 * raise, 0.3, cast), armB: lerp(-0.3, -0.7, raise), bodyY: 0.5 + 1.8 * raise, legSpread: 1.3 + 0.6 * raise });
          castChain(p, s, E, w);
        } else {
          // груз у врага (пока он жив и тянется — цепь идёт к нему); герой откидывается назад, выбирая цепь
          const pull = ph === "active" ? easeInOut(clamp(k.a * 1.1, 0, 1)) : 1;
          const e = act.grabE && act.grabE.alive ? toLocal(p, act.grabE.x, act.grabE.centerY, KU_T) : E;
          if (ph === "active") {
            Object.assign(P, { armF: lerp(1.6, 0.55, pull), elbowF: lerp(0.08, 1.0, pull), wBlend: 1, wAngle: -0.05, lean: lerp(0.35, -0.32, pull), armB: lerp(-0.6, -1.4, pull), sx: 1.1 - 0.1 * pull, bodyY: 2.4 + pull * 0.6, legSpread: 2.0 });
            chainSet(p, e.x, e.y, 0, lerp(3, 0.5, pull), 1);
          } else {
            const r = easeInOut(k.r);
            Object.assign(P, { armF: lerp(0.55, 0.7, r), elbowF: lerp(1.0, 0.5, r), wBlend: 1, wAngle: lerp(-0.05, 1.0, r), lean: lerp(-0.32, 0.05, r), armB: lerp(-1.4, -0.3, r), bodyY: lerp(3, 0.6, r), legSpread: lerp(2, 1.3, r) });
            KU_E.x = e.x; KU_E.y = e.y; reelChain(p, KU_E, k.r, 1);
          }
        }
      },
      update(cs, p, act, dt, tA) {
        const g = cs.game, def = act.def;
        stepIn(p, act, dt, tA, act.target ? clamp(Math.abs(act.target.x - p.x) - 120, 0, 90) : 0);
        trail(g, p, act);
        if (act.phase === "active" && !act.fired) {
          act.fired = true;
          const hand = kuTarget(cs, p, act), e = act.tg;
          const n = chainHits(cs, p, act, hand.x, hand.y, act.Ex, act.Ey, 6);
          snapFx(g, p, hand.x, hand.y, act.Ex, act.Ey, n > 0);
          g.sfx("slash", 1.3);
          if (e && act.hit.has(e.id) && e.alive && !e.executed && e.kind !== "brute") {
            stagger(e, g, def.stun);
            act.grabE = e; act.pullFrom = e.x;
            act.pullTo = clamp(p.x + act.dir * (e.w * e.scale * 0.5 + 18), 40, WORLD.w - 40);
            act.pullT = 0;
          }
        }
        const e = act.grabE;
        if (e) {
          if (!e.alive || e.executed) act.grabE = null;
          else {
            act.pullT += dt;
            const q = clamp(act.pullT / 0.17, 0, 1);
            e.x = lerp(act.pullFrom, act.pullTo, easeIn(q) * 0.35 + easeOut(q) * 0.65); e.vx = 0;
            if (q >= 1) { g.fx.dust(e.x, e.y, 4); g.camera.shake(0.12); g.sfx("hit", 0.9); act.grabE = null; }
          }
        }
      },
    },
    // сильная доля, точно (perfect): цепь обвивает врага и перебрасывает его через голову — приземляется за спиной на «и»
    // (вторая половина доли), удар о землю. Громилу не поднять — вместо этого «Маятник»
    kusariWrap: {
      kind: "custom", name: "Обмотка", startup: 0.1, active: 0.3, recovery: 0.26, cancel: 0.2,
      dmg: 18, knock: 300, stun: 0.5, moveControl: 0.05,
      pose(P, act, p, k) {
        const ph = act.phase, s = act.t - act.startup - act.travel, w = clamp(act.t / 0.04, 0, 1), E = kuEnd(act, p, KU_E);
        const raise = easeOut(k.s), cast = s > -KU_WIND ? easeIn((s + KU_WIND) / KU_WIND) : 0;
        if (ph === "startup" || ph === "travel") {
          Object.assign(P, { armF: lerp(lerp(1.0, 2.6, raise), 1.6, cast), elbowF: lerp(0.25, 0.08, cast), wBlend: 1, wAngle: lerp(-1.3, -0.05, cast), lean: lerp(-0.2 * raise, 0.3, cast), armB: lerp(-0.3, -0.7, raise), bodyY: 0.5 + 1.8 * raise, legSpread: 1.3 + 0.6 * raise });
          castChain(p, s, E, w);
        } else {
          const e = act.wrapE && act.wrapE.alive ? toLocal(p, act.wrapE.x, act.wrapE.centerY, KU_T) : E;
          if (ph === "active") {
            // пока враг летит по дуге, рука идёт от «на себя» вверх-назад и вниз через плечо
            const u = clamp(act.arcT == null ? 0 : act.arcT, 0, 1);
            Object.assign(P, { armF: u < 0.45 ? lerp(1.6, 3.0, easeOut(u / 0.45)) : lerp(3.0, 0.9, easeIn((u - 0.45) / 0.55)), elbowF: 0.1, wBlend: 1, wAngle: lerp(-0.05, -1.2, Math.sin(Math.PI * u)), lean: u < 0.45 ? lerp(0.3, -0.35, easeOut(u / 0.45)) : lerp(-0.35, 0.5, easeIn((u - 0.45) / 0.55)), armB: lerp(-0.8, -1.4, Math.sin(Math.PI * u)), bodyY: 2.4, legSpread: 2.0, cloak: -0.6 });
            chainSet(p, e.x, e.y, 0, 1, 1);
          } else {
            const r = easeInOut(k.r);
            Object.assign(P, { armF: lerp(0.9, 0.7, r), elbowF: lerp(0.1, 0.5, r), wBlend: 1, wAngle: lerp(-0.4, 1.0, r), lean: lerp(0.5, 0.05, r), armB: lerp(-1.0, -0.3, r), bodyY: lerp(3, 0.6, r), legSpread: lerp(2, 1.3, r) });
            KU_E.x = e.x; KU_E.y = e.y; reelChain(p, KU_E, k.r, 1);
          }
        }
      },
      update(cs, p, act, dt, tA) {
        const g = cs.game, def = act.def;
        stepIn(p, act, dt, tA, act.target ? clamp(Math.abs(act.target.x - p.x) - 110, 0, 60) : 0);
        trail(g, p, act);
        if (act.phase === "active" && !act.fired) {
          act.fired = true;
          const hand = kuTarget(cs, p, act), e = act.tg;
          // первый удар (обмотка) — половина силы; основной — приземление
          act.dmgK = 0.5;
          const n = chainHits(cs, p, act, hand.x, hand.y, act.Ex, act.Ey, 6);
          snapFx(g, p, hand.x, hand.y, act.Ex, act.Ey, n > 0);
          g.sfx("slash", 1.3);
          if (e && act.hit.has(e.id) && e.alive && !e.executed && e.kind !== "brute") {
            const P = period(cs);
            act.arc = clamp(P * 0.5, 0.2, 0.34);
            act.wrapE = e; act.wx0 = e.x; act.wy0 = e.y; act.arcT = 0;
            act.wxEnd = clamp(p.x - act.dir * 34, 40, WORLD.w - 40);
            stagger(e, g, act.arc + 0.5);
            // активная фаза = перелёт врага; приём не отменяется раньше приземления
            const d = act.arc + 0.04 - act.active;
            act.active += d; act.total += d; act.cancel = act.total - 0.12;
            g.fx.slashArc(e.x, e.centerY, 14 * e.scale, 0.4, 0.4 + TAU * 0.78, "#9aa3b5", 2, 0.3);
            e.flash = 0.35;
          } else act.dmgK = 1;
        }
        const e = act.wrapE;
        if (e) {
          if (!e.alive || e.executed) act.wrapE = null;
          else if (!act.slammed) {
            act.arcT = clamp((act.t - tA) / act.arc, 0, 1);
            const u = act.arcT;
            e.x = lerp(act.wx0, act.wxEnd, easeInOut(u)); e.y = act.wy0 - 64 * Math.sin(Math.PI * u) * (1 - 0.15 * u); e.vx = 0; e.vy = 0;
            if (u >= 1) {
              act.slammed = true; e.y = act.wy0; e.vy = 0; act.dmgK = 1.15;
              g.fx.shockwave(e.x, e.y, p.skin.accent, 150); g.fx.dust(e.x, e.y, g.fx.low ? 4 : 8);
              g.fx.cut(e.x, e.y - 50, e.x, e.y - 2, p.skin.accent, 3, 0.3);
              g.fx.cut(e.x, e.y - 50, e.x, e.y - 2, "#ffffff", 1, 0.22);
              g.camera.shake(0.22); g.sfx("slam"); g.sfx("hit", 1.2, true);
              cs._applyHit(e, act, -act.dir, e.x, e.centerY);
              act.wrapE = e;
            }
          }
        }
      },
    },
    // «и» (полдоли) сразу после удара в долю (вместо «Шквала»): груз хлещет в цель дважды — прямо и чуть ниже обратным
    // ходом, щелчок цепи на каждом; дальность хлёста короче броска (до 130)
    kusariCrack: {
      kind: "custom", name: "Двойной хлёст", startup: 0.03, active: 0.17, recovery: 0.18, cancel: 0.13,
      dmg: 8, knock: 90, stun: 0.3, moveControl: 0.15,
      pose(P, act, p, k) {
        const ph = act.phase, E = kuEnd(act, p, KU_E), d = Math.hypot(E.x, E.y), cap = d > 130 ? 130 / d : 1;
        if (ph === "startup" || ph === "travel") {
          Object.assign(P, { armF: lerp(0.8, 2.2, easeOut(k.s)), elbowF: 0.6, wBlend: 1, wAngle: -1.0, lean: -0.1, armB: -0.6, bodyY: 0.8 });
          orbit(KU_W, 0, -2, 16, 6, -1.6 + 30 * act.t);
          chainSet(p, KU_W.x, KU_W.y, -4, 2, clamp(act.t / 0.03, 0, 1)); p.kuLen = 30;
        } else if (ph === "active") {
          const u = k.a, s1 = u < 0.5 ? u / 0.5 : (u - 0.5) / 0.5, out = Math.sin(Math.PI * Math.min(1, s1 * 1.15)), two = u >= 0.5;
          Object.assign(P, { armF: two ? lerp(1.5, 1.05, s1) : lerp(2.2, 1.5, easeOut(s1)), elbowF: lerp(0.6, 0.08, out), wBlend: 1, wAngle: lerp(-0.6, 0.25, out), lean: 0.22 * out, armB: -0.8, bodyY: 1.4, legSpread: 1.6, cloak: -0.5 * out });
          chainSet(p, lerp(14, E.x * cap, out), lerp(2, E.y * cap + (two ? 10 : 0), out), (two ? 7 : -7) * (1 - out), 1, 1); p.kuLen = 40;
        } else {
          const r = easeInOut(k.r);
          Object.assign(P, { armF: lerp(1.05, 0.65, r), elbowF: lerp(0.1, 0.5, r), wBlend: 1, wAngle: lerp(0.25, 1.0, r), lean: lerp(0.15, 0.04, r), armB: lerp(-0.8, -0.3, r), bodyY: lerp(1.4, 0.6, r) });
          p.wExt = 1 - easeOut(clamp(k.r * 3, 0, 1)); p.kuLen = lerp(30, 9, r);
        }
      },
      update(cs, p, act, dt, tA) {
        const g = cs.game;
        p.vx = damp(p.vx, 0, 12, dt);
        trail(g, p, act);
        if (act.phase !== "active") return;
        const u = (act.t - tA) / act.active, idx = u < 0.5 ? 1 : 2;
        if (act.crack !== idx && (u - (idx - 1) * 0.5) > 0.2) {
          act.crack = idx; act.hit.clear();
          const hand = kuTarget(cs, p, act);
          const dx = act.Ex - hand.x, dy = act.Ey - hand.y, d = Math.hypot(dx, dy);
          if (d > 130) { act.Ex = hand.x + dx * 130 / d; act.Ey = hand.y + dy * 130 / d; }
          act.fired = true;
          const ey = act.Ey + (idx === 2 ? 10 : 0);
          const n = chainHits(cs, p, act, hand.x, hand.y, act.Ex, ey, 7);
          snapFx(g, p, hand.x, hand.y, act.Ex, ey, n > 0);
          g.fx.ring(act.Ex, ey, 2, 10, "#ffffff", 0.12, 1.2);      // щелчок
          g.sfx("slash", 1.45 + 0.2 * idx);
          if (n) g.camera.kick(0.006);
        }
      },
    },
    // сильная доля, точно, впереди ≥ 2 врагов на средней дистанции: груз низко проносится по полу дугой из-за спины вперёд
    // и подсекает всех, мимо кого прошёл (враги падают); цепь при этом видно во всю длину
    kusariReap: {
      kind: "custom", name: "Жнец", startup: 0.1, active: 0.16, recovery: 0.3, cancel: 0.22,
      dmg: 16, knock: 140, stun: 0.85, moveControl: 0.05,
      pose(P, act, p, k) {
        const ph = act.phase, gv = p.y - CharacterRenderer.handWorld(p, 0).y - 2, w = clamp(act.t / 0.04, 0, 1);
        if (ph === "startup" || ph === "travel") {
          // замах: груз раскручен сбоку и уходит низко за спину
          const e = easeOut(k.s);
          Object.assign(P, { armF: lerp(0.8, -0.6, e), elbowF: 0.25, wBlend: 1, wAngle: lerp(-0.4, 2.6, e), lean: -0.18 * e, armB: lerp(-0.3, 1.0, e), bodyY: 0.6 + 2.2 * e, legSpread: 1.3 + 0.9 * e, headTilt: 0.1 * e });
          orbit(KU_W, -6, 4, 20, 14, -1.2 - 14 * act.t);
          const bk = easeIn(clamp((k.s - 0.55) / 0.45, 0, 1));
          chainSet(p, lerp(KU_W.x, -70, bk), lerp(KU_W.y, gv, bk), -5, 2, w); p.kuLen = 80;
        } else if (ph === "active") {
          // проход груза по полу: из-за спины (−70) вперёд до 150, посередине чуть приподнят
          const u = easeInOut(k.a), x = lerp(-70, 150, u);
          Object.assign(P, { armF: lerp(-0.6, 1.3, u), elbowF: 0.1, wBlend: 1, wAngle: lerp(2.6, 0.3, u), lean: lerp(-0.18, 0.42, u), armB: lerp(1.0, -1.2, u), bodyY: 3.2, legSpread: 2.3, cloak: -1.1, headTilt: 0.12 });
          chainSet(p, x, gv - 6 * Math.sin(Math.PI * u), -8 * (1 - u), 1, 1); p.kuLen = 160;
        } else {
          const r = easeInOut(k.r);
          Object.assign(P, { armF: lerp(1.3, 0.65, r), elbowF: lerp(0.1, 0.5, r), wBlend: 1, wAngle: lerp(0.3, 1.0, r), lean: lerp(0.42, 0.04, r), armB: lerp(-1.2, -0.3, r), bodyY: lerp(3.2, 0.6, r), legSpread: lerp(2.3, 1.3, r) });
          KU_T.x = 150; KU_T.y = gv; reelChain(p, KU_T, k.r, 1); p.kuLen = lerp(120, 9, r);
        }
      },
      update(cs, p, act, dt, tA) {
        const g = cs.game, def = act.def;
        p.vx = damp(p.vx, 0, 12, dt);
        trail(g, p, act);
        if (act.phase !== "active") return;
        const u = easeInOut(clamp((act.t - tA) / act.active, 0, 1)), wx = p.x + p.facing * lerp(-70, 150, u);
        if (!act.fired) { act.fired = true; g.sfx("slash", 0.95); g.camera.kick(0.008); }
        if (!g.fx.low && (act.lastDust == null || Math.abs(wx - act.lastDust) > 26)) { act.lastDust = wx; g.fx.dust(wx, p.y, 1); }
        for (const e of g.enemies) {
          if (!e.targetable || act.hit.has(e.id)) continue;
          const ahead = (e.x - p.x) * p.facing;
          if (ahead < -76 || ahead > 156 || Math.abs(e.y - p.y) > 30) continue;
          if (p.facing * (wx - e.x) < -e.w * e.scale * 0.5) continue;        // груз ещё не дошёл до врага
          act.hit.add(e.id);
          cs._applyHit(e, act, p.facing, e.x, e.y - 6);
          if (e.alive && !e.executed && e.kind !== "brute") { e.vy = Math.min(e.vy, -170); e.onGround = false; }   // подсечка: враг теряет опору
          g.fx.cut(e.x - 12, e.y - 3, e.x + 12, e.y - 3, "#ffffff", 1, 0.12);
          g.fx.sparks(e.x, e.y - 4, 4, p.skin.accent, 150, -Math.PI / 2, 1.4, 0.25);
        }
        if (act.t - tA + dt >= act.active && !act.swept) { act.swept = true; g.fx.cut(p.x - p.facing * 70, p.y - 2, p.x + p.facing * 150, p.y - 2, p.skin.accent, 2, 0.18); }
      },
    },
    // сильная доля при точном нажатии вплотную (место подброса): цепь с грузом вращается вокруг героя, втягивает и бьёт всех
    // в радиусе троекратно; хорошо видно длинную цепь по кругу
    kusariWhirl: {
      kind: "melee", spin: true, hits: 3, startup: 0.07, active: 0.3, recovery: 0.24, cancel: 0.22,
      dmg: 9, reach: 76, knock: 320, stun: 0.6, lunge: 10, arc: [-2.8, 2.6], fxR: 2.1, fxW: 0.8, lash: true, name: "Вихрь цепи",
      update(cs, p, act, dt, tA) {
        const g = cs.game, def = act.def;
        trail(g, p, act);
        if (act.phase !== "active") return;
        // вихрь втягивает всех в радиусе к центру (но не вплотную)
        for (const e of g.enemies) {
          if (!e.targetable || e.kind === "brute") continue;
          const dx = p.x - e.x, ad = Math.abs(dx);
          if (ad < def.reach * 1.3 && ad > 16) { e.x += sign(dx) * Math.min(ad - 16, 120 * dt); }
        }
      },
      pose(P, act, p, k) {
        const R0 = 76, spin = 34;
        // вращение по орбите вокруг героя (центр — ниже поднятой руки): раскрутка, полный круг, затухание
        const R = act.phase === "startup" ? lerp(12, R0, easeOut(k.s)) : act.phase === "active" ? R0 : lerp(R0, 14, easeIn(k.r));
        const th = -1.2 + (act.t) * spin;
        if (act.phase === "active") {
          Object.assign(P, { armF: 2.6, elbowF: 0.1, wBlend: 1, wAngle: kb(act, p) + TAU * 2.4 * k.a, armB: -1.7, sx: 1.08, sy: 0.94, cloak: -1.2, bodyY: 1.6, legSpread: 1.9 });
        } else if (act.phase === "startup") {
          Object.assign(P, { armF: lerp(1.0, 2.6, easeOut(k.s)), elbowF: 0.2, wBlend: 1, wAngle: kb(act, p) - TAU * 0.5 * (1 - k.s), armB: lerp(-0.3, -1.5, k.s), bodyY: 0.5 + 1.6 * k.s, legSpread: 1.3 + 0.6 * k.s, lean: -0.1 * k.s });
        } else {
          const e = easeInOut(k.r);
          Object.assign(P, { armF: lerp(2.6, 0.7, e), elbowF: 0.2, wBlend: 1, wAngle: kb(act, p) + TAU * 2.4 + lerp(0, 1.5, e), armB: lerp(-1.7, -0.3, e), bodyY: lerp(1.6, 0.6, e), legSpread: lerp(1.9, 1.3, e) });
        }
        orbit(KU_W, -4, 12, R, 0.22 * R + 2, th);
        chainSet(p, KU_W.x, KU_W.y, -R * 0.1, 2, act.phase === "recovery" ? 1 - easeInOut((k.r - 0.4) / 0.6) : clamp(act.t / 0.04, 0, 1));
      },
    },
  };
  // опорный угол вращения для позы приёмов набора (приём не из таблицы — база от текущего угла)
  const kb = (act, p) => baseAng(act, p, -1.6, "kc");

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
    katanaSwallow: { w0: -2.5, w1: 0.9, a0: 2.8, a1: 1.5, e0: 0.2, e1: 0.05 },        // «Ласточка»: разрез сверху вниз и тут же обратный снизу вверх
  };
  const katanaPose = (P, act, p, k) => {
    const nm = BASE[act.name] || act.name;
    if (SKIP[nm]) return;
    const S = KAT[nm] || KAT.slash1, ph = act.phase, g = ground(p), { h, s, u } = subOf(act, k);
    const kb = baseAng(act, p, S.w0);
    let w = S.w0, arm = S.a0, elb = S.e0;
    if (ph === "startup" || ph === "travel") {
      // иай: сначала корпус «набирается» и левая рука тянет ножны назад (саябики), затем клинок уходит в замах;
      // к удару — напряжение (лёгкая дрожь), дыхание не даёт кадру застыть
      const kk = ph === "travel" ? 1 : k.s, dip = easeOut(Math.min(1, kk * 2)), e = easeInOut(clamp((kk - 0.3) / 0.7, 0, 1));
      w = lerp(KAT_REST, S.w0, e);
      arm = lerp(0.45, S.a0, e); elb = lerp(0.95, S.e0, e);
      Object.assign(P, { lean: -0.06 - 0.16 * dip + 0.025 * Math.sin(act.t * 26), armB: 0.55 - 1.0 * dip, cloak: -0.6 * dip });
      if (g) Object.assign(P, { bodyY: 1 + 2.4 * dip + 0.3 * Math.sin(act.t * 70) * k.s, sy: 1 - 0.07 * dip, sx: 1 + 0.05 * dip, legSpread: 1.5 + 0.5 * dip });
    } else if (ph === "active") {
      let q = easeOut(k.a), a0 = S.w0, a1 = S.w1, r0 = S.a0, r1 = S.a1, f0 = S.e0, f1 = S.e1;
      if (h > 1 && !S.spin && !S.flat) { q = easeOut(u); if (s % 2) { a0 = S.w1; a1 = S.w0 + (nm === "slash1" ? -2.4 - KAT_REST : 0); r0 = S.a1; r1 = 2.6; f0 = S.e1; f1 = 0.2; } }
      w = lerp(a0, a1, q); arm = lerp(r0, r1, q); elb = lerp(f0, f1, q);
      if (S.flat && h > 1) { arm = 1.57; elb = 0; }
      Object.assign(P, { armB: -1.35 + 0.3 * q, cloak: -1.1 });         // левая рука резко отводит ножны назад
      if (g) Object.assign(P, { legSpread: 2.2, bodyY: 3, sx: 1.18, sy: 0.88 });
      P.lean = 0.5;
      if (S.spin) P.turn = -easeInOut(k.a);                 // круговой разрез: корпус делает оборот вокруг оси
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
    if (g) Object.assign(P, { bodyY: 2.9 + 0.45 * Math.sin(act.t * 22), legSpread: 1.95 });
    if (ph === "startup" || ph === "travel") {
      const e = easeOut(ph === "travel" ? 1 : k.s);
      // замах с «пружиной»: клинок сначала поднимается чуть выше исходного угла и только потом встаёт в замах — кадр не застывает
      w = S.w0 + 0.4 * Math.sin(Math.PI * e); arm = lerp(0.85, S.a0, e); elb = lerp(1.0, S.e0, e);
      Object.assign(P, { lean: 0.1 - 0.2 * e + 0.02 * Math.sin(act.t * 30), armB: lerp(1.0, 1.35, e) + 0.12 * Math.sin(act.t * 22) });
    } else if (ph === "active") {
      let q = easeOut(k.a), a0 = S.w0, a1 = S.w1, r0 = S.a0, r1 = S.a1;
      if (h > 1 && !S.spin) {       // серия коротких уколов: рука качается туда-обратно, острие каждый раз вперёд
        q = easeOut(Math.min(1, u * 1.4)); a0 = s % 2 ? 0.45 : S.w0; a1 = 0.0; r0 = 0.9; r1 = 1.57;
      }
      w = lerp(a0, a1, q); arm = lerp(r0, r1, q); elb = lerp(S.e0, S.e1, q);
      Object.assign(P, { armB: lerp(1.35, -0.9, q), lean: 0.35 });
      if (g) Object.assign(P, { sx: 1.14, sy: 0.9, legSpread: 2.1, bodyY: 3 });
      if (S.spin) P.turn = -easeInOut(k.a);                 // вихрь: корпус делает оборот вокруг оси
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

  /* ---------- приёмы: Багровая катана ---------- */
  const katanaMoves = {
    // «и» (полдоли) сразу после удара в долю: два разреза подряд в одну точку — сверху вниз и тут же обратным ходом снизу вверх;
    // на втором герой подаётся вперёд, с клинка срывается россыпь искр
    katanaSwallow: {
      kind: "melee", hits: 2, startup: 0.03, active: 0.2, recovery: 0.2, cancel: 0.14,
      dmg: 9, reach: 46, knock: 230, stun: 0.5, lunge: 70, arc: [-2.5, 1.2], fxR: 1.2, fxW: 0.65, name: "Ласточка",
      update(cs, p, act, dt, tA) {
        const g = cs.game;
        if (act.phase !== "active" || (act.sub || 0) === act.ksSub) return;
        act.ksSub = act.sub || 0;
        if (act.ksSub > 0) {
          p.vx = act.dir * 120; g.addAfterimage(p);
          const cx = p.x + act.dir * 28, cy = p.y - 20;
          g.fx.sparks(cx, cy, 6, p.skin.accent, 200, act.dir > 0 ? -0.9 : Math.PI + 0.9, 1.6, 0.35);
          if (!g.fx.low) g.fx.cut(cx - act.dir * 6, cy + 20, cx + act.dir * 22, cy - 22, "#ffffff", 1.2, 0.14);
        }
      },
    },
    // сильная доля после паузы: рывок сквозь цель без видимого урона, «щелчок» ножен на следующей доле — враг рассечён
    katanaIai: {
      kind: "custom", name: "Иай", startup: 0.07, active: 0.1, recovery: 0.3, cancel: 0.4,
      dmg: 24, knock: 0, stun: 0.5, moveControl: 0.05,
      pose(P, act, p, k) {
        const kbA = baseAng(act, p, KAT_REST, "kc");
        if (act.phase === "startup") {      // низкая стойка: ладонь на рукояти, корпус подан вперёд, дрожь напряжения
          Object.assign(P, { armF: 0.45, elbowF: 0.95, wBlend: 1, wAngle: kbA, lean: -0.2 - 0.1 * k.s, bodyY: 3 + 0.3 * Math.sin(act.t * 70), sy: 0.9, sx: 1.06, legSpread: 2.0, armB: 0.2 });
        } else if (act.phase === "travel") {
          Object.assign(P, { armF: 1.5, elbowF: 0.05, wBlend: 1, wAngle: kbA + (-0.1 - KAT_REST), lean: 0.85, bodyY: 2, sx: 1.15, sy: 0.88, legSpread: 2.1, armB: -1.5, cloak: -1.3 });
        } else if (act.phase === "active") {
          Object.assign(P, { armF: 1.5, elbowF: 0.05, wBlend: 1, wAngle: kbA + (-0.1 - KAT_REST), lean: 0.6, bodyY: 2.4, sx: 1.12, sy: 0.9, legSpread: 2.0, armB: -1.2, cloak: -0.8 });
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
    // сильная доля вплотную при груве ≥ 1 (место подброса): герой крутится на месте с двумя клинками — два круговых
    // удара по всем рядом; корпус делает оборот вокруг оси, за ним остаются тени
    daggerWhirl: {
      kind: "melee", spin: true, hits: 2, startup: 0.04, active: 0.26, recovery: 0.2, cancel: 0.17,
      dmg: 10, reach: 44, knock: 250, stun: 0.55, lunge: 40, arc: [-2.8, 2.6], fxR: 1.35, fxW: 0.7, name: "Вихрь теней",
      update(cs, p, act, dt, tA) {
        const g = cs.game;
        if (act.phase !== "active" || (act.sub || 0) === act.kwSub) return;
        act.kwSub = act.sub || 0;
        g.addAfterimage(p);
        g.fx.smoke(p.x, p.y - 12, 4, "#0b0c10", 0.4);
        if (act.kwSub > 0) g.fx.ring(p.x, p.y - 18, 8, 46, p.skin.accent, 0.22, 2);
      },
      pose(P, act, p, k) {
        const kbA = baseAng(act, p, DAG_REST, "kc"), g = ground(p);
        if (act.phase === "startup") {
          // присесть и скрутить корпус: клинок отведён назад, свободная рука впереди
          Object.assign(P, { armF: lerp(0.85, 0.2, easeOut(k.s)), elbowF: 1.2, wBlend: 1, wAngle: kbA + 0.4 * Math.sin(Math.PI * k.s), lean: -0.25 * k.s, armB: 1.2, bodyY: 1 + 2.4 * easeOut(k.s), legSpread: 1.5 + 0.5 * k.s, turn: 0.06 * k.s });
        } else if (act.phase === "active") {
          // два оборота клинка за один оборот корпуса; на втором ударе руки меняются местами
          const q = easeInOut(k.a);
          Object.assign(P, { armF: 1.5, elbowF: 0.15, wBlend: 1, wAngle: kbA + (lerp(DAG_REST, DAG_REST - TAU * 2, q) - DAG_REST), lean: 0.2, armB: lerp(-1.3, 1.3, Math.abs(Math.sin(Math.PI * q * 2))), turn: -q, cloak: -1.2 });
          if (g) Object.assign(P, { bodyY: 3, legSpread: 2.0, sx: 1.08, sy: 0.92 });
        } else {
          const e = easeInOut(k.r);
          Object.assign(P, { armF: lerp(1.5, 0.85, e), elbowF: lerp(0.15, 1.0, e), wBlend: 1, wAngle: kbA - TAU * 2, lean: lerp(0.25, 0.1, e), armB: lerp(0.5, 1.0, e), bodyY: lerp(3, 1.5, e), legSpread: lerp(2, 1.6, e) });
        }
      },
    },
    // perfect-нажатие на средней дистанции: исчезает в тени и бьёт врага со спины
    daggerStep: {
      kind: "custom", name: "Теневой шаг", startup: 0.05, active: 0.1, recovery: 0.2, cancel: 0.14,
      dmg: 18, reach: 36, knock: 230, stun: 0.5, moveControl: 0.05,
      pose(P, act, p, k) {
        const kbA = baseAng(act, p, DAG_REST, "kc");
        if (act.phase === "startup") {
          // растворение: герой поворачивается к врагу боком (силуэт сужается) и подаётся назад
          Object.assign(P, { turn: 0.25 * easeIn(k.s), sy: 1 + 0.06 * k.s, lean: -0.4 * k.s, armF: 1.0, elbowF: 0.8, wBlend: 1, wAngle: kbA, armB: -0.6, bodyY: 1.5 });
        } else if (act.phase === "active") {
          // выход из тени со спины: глубокий выпад, клинок вперёд
          Object.assign(P, { turn: 0.25 * (1 - easeOut(Math.min(1, k.a * 2.5))), sx: 1.12, sy: 0.9, lean: 0.8, bodyY: 2.6, legSpread: 2.0, armF: 1.5, elbowF: 0.1, wBlend: 1, wAngle: kbA + (lerp(DAG_REST, 0.0, easeOut(k.a)) - DAG_REST), armB: -1.4, cloak: -1.2 });
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
      // «и» сразу после удара в долю — двойной хлёст грузом вместо трёх уколов
      if (name === "flurry" && c.dx < 150) return "kusariCrack";
      // то же на средней дистанции: бросок груза в долю, на «и» — двойной хлёст
      if ((name === "dash" || name === "pierce") && c.j.offbeat && c.dx < 150 && cs.time - cs.lastActionT < 0.6) return "kusariCrack";
      // средняя и дальняя дистанция (общая логика выбрала рывок): вместо рывка — удары длинной цепью с места
      if (name === "dash" || name === "pierce") {
        const T = cs.time, ready = (key, s) => T - (cs[key] == null ? -9 : cs[key]) > s, brute = c.target.kind === "brute";
        if (c.j.strong && c.good) {
          // впереди двое и больше на средней дистанции — «Жнец» (подсечка всех грузом по полу)
          let front = 0;
          for (const e of cs.game.enemies) if (e.targetable && Math.abs(e.y - c.p.y) < 30) { const a = (e.x - c.p.x) * sign(c.target.x - c.p.x); if (a > 10 && a < 150) front++; }
          if (front >= 2 && ready("kuReapT", 1.6)) { cs.kuReapT = T; return "kusariReap"; }
          // сильная доля: точно — «Обмотка» (бросок через голову), иначе «Маятник» (удар грузом сверху вниз)
          if (c.j.rating === "perfect" && !brute && c.dx <= 150 && ready("kuWrapT", 2.2)) { cs.kuWrapT = T; return "kusariWrap"; }
          if (ready("kuPendT", 0.9)) { cs.kuPendT = T; return "kusariPendulum"; }
        }
        // точное нажатие вдали — «Цепной захват» (подтягивает врага), не чаще раза в 1,3 с
        if (c.j.rating === "perfect" && !brute && c.dx >= 70 && ready("kbGrabT", 1.3)) { cs.kbGrabT = T; return "kusariGrab"; }
        return "kusariLash";
      }
    },
    takedown(cs, kind) { return kind === "xcut" ? "kusariCoil" : null; },
  });
  // «Бросок груза» — основной дальний удар, а не комбинация: подпись над героем не показываем
  { const i = COMBO_MOVES.indexOf("kusariLash"); if (i >= 0) COMBO_MOVES.splice(i, 1); }
  registerKit("katana", {
    moves: katanaMoves,
    pose: katanaPose,
    choose(cs, name, c) {
      if (!c.target || c.air) return;
      if (name === "flurry") return "katanaSwallow";          // синкопа «и» после удара — «Ласточка» вместо трёх уколов
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
      if (!c.target || c.air) return;
      // сильная доля вплотную (место подброса) при груве ≥ 1 — вихрь теней вместо восходящего разреза
      if (name === "rise" && cs.groove >= 1) { cs.lastRiseT = cs.time; return "daggerWhirl"; }
      if (name !== "dash" || !c.good) return;
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
        Object.assign(P, { armF: 1.5, elbowF: 0.05, wAngle: lerp(kbA, -0.12, easeOut(ph(0.28, 0.33))), lean: 0.85, bodyY: 2, sx: 1.15, sy: 0.88, armB: -1.5, cloak: -1.3 });
      } else if (t < 0.62) {
        const s = easeInOut(ph(0.42, 0.62));
        Object.assign(P, { armF: lerp(1.5, 1.7, s), elbowF: 0.05, wAngle: lerp(-0.12, -0.7, s), lean: lerp(0.6, 0.15, s), bodyY: lerp(2.4, 0.8, s), sx: lerp(1.15, 1.0, s), sy: lerp(0.9, 1, s), armB: lerp(-1.2, -0.4, s), cloak: lerp(-0.8, 0.2, s), legSpread: lerp(2, 1.5, s) });
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

  // Кусаригама «ЦЕПНЫЕ ОКОВЫ»: раскрутка груза над головой → бросок (цепь через всё поле) → три витка вокруг врага →
  // рывок к герою → враг взлетает за спину → мах цепью через голову → удар о землю впереди. Цепь всё время натянута до врага.
  registerTakedown("kusariCoil", {
    name: "ЦЕПНЫЕ ОКОВЫ", dur: 1.3, death: "slam",
    update(cs, td, api) {
      const g = cs.game, p = g.player, e = td.e, d = td.dir, t = api.t, cy = api.cy, col = p.skin.accent;
      p.y = td.py; p.x = td.px; p.facing = d;
      const half = e.w * e.scale * 0.5;
      const hold = clamp(p.x + d * (half + 22), 40, WORLD.w - 40), back = p.x - d * 8, far = clamp(p.x + d * (half + 74), 40, WORLD.w - 40);
      const bound = clamp((t - 0.33) / 0.16, 0, 1), sw = clamp((t - 0.8) / 0.12, 0, 1);
      // враг скован: плечи прижаты, голова опущена; в полёте — сжимается и переворачивается
      e.tdPose = { lean: -0.12 * bound + 0.5 * sw, headTilt: -0.25 * bound, armF: lerp(0.35, 0.05, bound), armB: lerp(-0.3, 0.05, bound), bodyY: 1.5 * bound, tuck: t > 0.66 && t < 0.92 ? 0.6 : 0, spin: t >= 0.8 && t < 0.92 ? TAU * easeInOut(sw) : 0 };
      api.once("throw", 0.31, () => {
        const h = CharacterRenderer.handWorld(p, 0);
        g.fx.cut(h.x, h.y, e.x, cy, "#9aa3b5", 2.6, api.life(0.3));
        g.fx.cut(h.x, h.y, e.x, cy, "#ffffff", 0.9, api.life(0.22));
        g.sfx("slash", 1.4); g.camera.shake(0.08);
      });
      // три витка цепи вокруг корпуса — тонкие дуги разной высоты
      [[0.34, -10, 0.4], [0.4, 0, 2.6], [0.46, 10, 1.0]].forEach(([tt, dy, a0], i) => api.once("coil" + i, tt, () => {
        g.fx.slashArc(e.x, cy + dy, 13 * e.scale, a0, a0 + TAU * 0.78, "#9aa3b5", 2, api.life(0.34));
        g.fx.slashArc(e.x, cy + dy, 13 * e.scale, a0, a0 + TAU * 0.78, "#ffffff", 0.8, api.life(0.26));
        e.flash = 0.35; g.sfx("slash", 1.1 + 0.15 * i);
      }));
      // рывок: враг скользит к герою, цепь натянута
      if (t >= 0.5 && t < 0.66) e.x = lerp(td.ex, hold, easeIn(clamp((t - 0.5) / 0.16, 0, 1)));
      else if (t >= 0.66 && t < 0.8) {
        // подброс за спину: враг взмывает над героем
        const u = easeOut((t - 0.66) / 0.14);
        e.x = lerp(hold, back, u); e.y = td.ey - 58 * u;
      } else if (t >= 0.8 && t < 0.92) {
        // мах через голову вперёд: по дуге выше, к земле — ускоряясь
        const u = (t - 0.8) / 0.12;
        e.x = lerp(back, far, easeInOut(u)); e.y = lerp(td.ey - 58, td.ey, easeIn(u)) - 16 * Math.sin(Math.PI * u);
      } else if (t >= 0.92) { e.x = far; e.y = td.ey; }
      api.once("yank", 0.5, () => { api.streak(td.ex, hold, cy); g.sfx("dash"); g.camera.shake(0.18); });
      api.once("lift", 0.66, () => { g.sfx("slash", 1.6); g.fx.sparks(back, td.ey - 20, 5, col, 160, -Math.PI / 2, 1.2, 0.25); });
      api.once("slam", 0.92, () => {
        e.x = far; e.y = td.ey;
        g.fx.cut(e.x, td.ey - 54, e.x, td.ey - 2, col, 3.2, api.life(0.4));
        g.fx.cut(e.x, td.ey - 54, e.x, td.ey - 2, "#ffffff", 1.1, api.life(0.3));
        g.fx.shockwave(e.x, td.ey, col, 160); g.fx.dust(e.x, td.ey, api.low ? 4 : 9); g.sfx("slam");
        api.finish();
      });
    },
    pose(cs, p, td) {
      const t = td.t, ph = (a, b) => clamp((t - a) / (b - a), 0, 1), e = td.e;
      const P = { wBlend: 1, legAmp: 0, legSpread: 1.9, bodyY: 2 };
      const w = clamp(t / 0.05, 0, 1);
      const E = toLocal(p, e.x, e.centerY, KU_E);
      const dd = Math.hypot(E.x, E.y);
      if (dd > KU_L) { E.x *= KU_L / dd; E.y *= KU_L / dd; }
      if (t < 0.28) {
        // раскрутка груза над головой, радиус растёт
        const s = easeOut(ph(0, 0.28));
        Object.assign(P, { armF: lerp(1.0, 2.7, s), elbowF: 0.2, wAngle: -1.3, lean: -0.15 * s, armB: lerp(-0.3, -1.4, s), bodyY: 1 + 1.5 * s });
        orbit(KU_W, 0, -2, lerp(12, 30, s), 9, -1.2 + t * 26);
        chainSet(p, KU_W.x, KU_W.y, -6, 2, w);
      } else if (t < 0.33) {
        // бросок: рука вперёд, груз летит к врагу
        const f = easeIn(ph(0.28, 0.33)), s = ph(0.28, 0.33);
        Object.assign(P, { armF: lerp(2.7, 1.65, s), elbowF: 0.1, wAngle: lerp(-1.3, -0.05, s), lean: lerp(-0.15, 0.4, s), armB: lerp(-1.4, -0.6, s), sx: 1 + 0.06 * s });
        orbit(KU_W, 0, -2, 30, 9, -1.2 + 0.28 * 26);
        chainSet(p, lerp(KU_W.x, E.x, f), lerp(KU_W.y, E.y, f), lerp(-6, 0, f), lerp(2, 4, f), 1);
      } else if (t < 0.5) {
        Object.assign(P, { armF: 1.65, elbowF: 0.05, wAngle: -0.05, lean: 0.4, armB: -0.6, sx: 1.1, sy: 0.94, bodyY: 2.4 });
        chainSet(p, E.x, E.y, 0, 2 * (1 - ph(0.33, 0.45)), 1);
      } else if (t < 0.66) {
        // рывок: герой откидывается назад, выбирая цепь
        const s = easeInOut(ph(0.5, 0.66));
        Object.assign(P, { armF: lerp(1.65, 0.5, s), elbowF: lerp(0.05, 1.1, s), wAngle: -0.05, lean: lerp(0.4, -0.35, s), armB: lerp(-0.6, -1.5, s), bodyY: 2.8, legSpread: 2.1 });
        chainSet(p, E.x, E.y, 0, 0.5, 1);
      } else if (t < 0.8) {
        // рука с цепью уходит вверх-назад, враг взлетает за спину
        const s = easeOut(ph(0.66, 0.8));
        Object.assign(P, { armF: lerp(0.5, 3.0, s), elbowF: lerp(1.1, 0.1, s), wAngle: lerp(-0.05, -1.1, s), lean: lerp(-0.35, -0.3, s), armB: -1.2, bodyY: lerp(2.8, 0.8, s), sy: 1 + 0.08 * s, cloak: 0.6 });
        chainSet(p, E.x, E.y, 0, 0, 1);
      } else if (t < 0.92) {
        // мах через плечо вперёд: рука идёт вниз, корпус подаётся
        const s = easeIn(ph(0.8, 0.92));
        Object.assign(P, { armF: lerp(3.0, 1.2, s), elbowF: 0.1, wAngle: lerp(-1.1, 0.5, s), lean: lerp(-0.3, 0.5, s), bodyY: lerp(0.8, 3, s), sx: 1 + 0.12 * s, sy: 1 - 0.08 * s, armB: lerp(-1.2, 0.2, s), legSpread: 2.0 });
        chainSet(p, E.x, E.y, 0, 0, 1);
      } else {
        const r = easeInOut(ph(0.92, 1.3));
        Object.assign(P, { armF: lerp(1.2, 0.7, r), elbowF: lerp(0.1, 0.5, r), wAngle: lerp(0.5, 1.0, r), lean: lerp(0.45, 0.04, r), bodyY: lerp(3, 0.5, r), sx: 1 + 0.1 * (1 - r), sy: 1 - 0.07 * (1 - r), armB: lerp(0.2, -0.3, r), legSpread: lerp(2, 1.3, r) });
        reelChain(p, E, ph(0.94, 1.3), 1);
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
          lean: lerp(-0.2, big ? 0.3 : 0.7, q), sx: 1 + 0.15 * q * (1 - r), sy: 1 - 0.1 * q * (1 - r), armB: lerp(1.2, -1.3, q), cloak: -0.8 * q, bodyY: 2.2 + 0.8 * q,
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
