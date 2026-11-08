/* =====================================================================
   Наборы огнестрела (12d_kits): «Ржавый обрез» (sawed) и «Тяжёлый револьвер» (revolver).
   У каждого — свои анимации всех выстрелов (kit.pose), по две комбинации (kit.moves + choose) и своё добивание.

   Обрез: от бедра двумя руками, отдача корпусом назад, перелом стволов и перезарядка в восстановлении.
     «Дуплет»          — сильная доля, точно: залп первого ствола на доле и второго на полдоле («и»).
     «Удар прикладом»  — враг подобрался вплотную сразу после стрельбы: удар прикладом на доле, залп в упор на полдоле.
     «Дуплет в упор»   — добивание: рывок вплотную, пауза, залп, второй ствол, враг летит через пол-экрана.
   Револьвер: вытянутая рука, прицел, отдача вверх, взвод курка свободной ладонью, прокрутка на пальце после серии.
     «Веер курка»      — сильная доля, точно, грув ≥ 2: 6 быстрых выстрелов по всем врагам впереди.
     «Рикошет»         — точный выстрел: пуля бьёт цель, отскакивает от пола и бьёт второго врага.
     «Дуэль»           — добивание: дуэльная пауза, разворот спиной, выстрел через плечо, прокрутка и в кобуру.

   Вне набора (общие файлы не трогаем): обёртка CombatSystem.updateAction (ход выстрелов act.kLast, эффекты перезарядки/взвода)
   и обёртка chooseAttack (удар прикладом нужен на ближней дистанции, куда kit.choose огнестрела не дотягивается:
   там общая логика выбирает приёмы ближнего боя).
   Урон за нажатие (при попадании всем залпом) ≈ комбинациям огнестрела с оружием: обрез ~32–34, револьвер ~30.
   ===================================================================== */
{
  const PI2 = Math.PI / 2;

  /** Угол прицеливания в координатах руки (как в actionPose). */
  const gunAim = (act, p) => {
    const tg = act.target;
    return PI2 - (tg ? Math.atan2(tg.centerY - (p.y - 20), Math.abs(tg.x - p.x)) : 0);
  };
  /** Секунд с последнего выстрела (отрицательно — ещё не стреляли). */
  const sinceFire = act => {
    if (act.kLast != null) return act.t - act.kLast;
    if (act.def.late) return -1;
    return act.t - (act.startup + (act.def.fireAt || 0));
  };
  /** Полдоли в секундах (ограничено, чтобы второй залп не уезжал при очень медленном или быстром темпе). */
  const halfBeat = act => clamp(((act.judge && act.judge.period) || 0.5) / 2, 0.15, 0.36);
  /** Враги впереди героя, ближние первыми. */
  const enemiesAhead = (g, p, dir, maxD) => {
    const r = [];
    for (const e of g.enemies) if (e.targetable && sign(e.x - p.x) === dir && Math.abs(e.x - p.x) < maxD) r.push(e);
    r.sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
    return r;
  };
  /** Продлить действие (act.total/cancel) до момента второго выстрела на полдоле. */
  const extendForHalf = act => {
    act.kHalf = halfBeat(act);
    act.kT2 = act.impactSong + act.kHalf;                 // музыкальное время второго выстрела
    const need = act.startup + act.kHalf + 0.06;
    if (act.startup + act.active < need) { const add = need - act.startup - act.active; act.active += add; act.total += add; }
    act.cancel = Math.min(act.total, Math.max(act.cancel, act.startup + act.kHalf + 0.05));
  };

  /** Залп обреза без звука (звук ставится на музыкальную полдолю заранее): дробь, отдача, вспышка. */
  const sawedBlast = (cs, p, act) => {
    const g = cs.game, def = act.def, low = g.fx.low;
    const hand = CharacterRenderer.handWorld(p, def.muzzle || 13);
    hand.y += 2;
    let tg = act.target;
    if (!tg || !tg.targetable) { tg = enemiesAhead(g, p, act.dir, 560)[0] || null; act.target = tg; }
    const ang = tg ? Math.atan2(tg.centerY - hand.y, tg.x - hand.x) : (act.dir > 0 ? 0 : Math.PI);
    cs._volley(p, act, hand, ang);
    if (def.recoil && p.onGround) p.vx -= act.dir * def.recoil;
    g.fx.sparks(hand.x, hand.y, 8, p.skin.accent, 270, ang, 0.8, 0.2);
    g.fx.ring(hand.x, hand.y, 3, 17, "#ffffff", 0.14, 2);
    if (!low) g.fx.glow(hand.x, hand.y, 4, 24, "#ffffff", 0.1, 0.5);
    g.camera.kick(0.014); g.camera.shake(0.12);
    act.kLast = act.t;
  };
  /** Звук и выстрел «на полдоле»: звук заранее (в музыкальный момент), сам залп — когда доля наступила. */
  const secondBarrel = (cs, p, act) => {
    const g = cs.game;
    if (act.kDone) return;
    if (!act.kSnd && g.songNow >= act.kT2 - 0.09) { act.kSnd = true; g.sfxAt(act.kT2, "shot", false); }
    if (g.songNow >= act.kT2 - 0.006 || act.t > act.startup + act.kHalf * 1.6) {
      if (!act.kSnd) g.sfx("shot", false);
      act.kDone = true; sawedBlast(cs, p, act);
    }
  };

  /* ---------------------------------------------------------------- Обрез: позы */
  function sawedPose(P, act, p, k) {
    const def = act.def;
    if (def.kind !== "ranged" && !def.kit) return;
    const aim = gunAim(act, p), ph = act.phase, since = sinceFire(act);
    const rec = since >= 0 ? Math.exp(-since * 9) : 0;          // отдача: резкий удар и спад за ~0.2 с
    // хват от бедра двумя руками: плечо опущено, предплечье по линии прицела, вторая рука на цевье
    let armF = aim - 0.62, elbowF = 0.62, armB = aim - 0.3;
    let lean = 0.14, bodyY = 2.2, legSpread = 1.8, headTilt = 0.05, sx = 1.03, sy = 0.96;
    if (ph === "startup") {
      const s = easeOut(k.s);
      armF = lerp(0.35, armF, s); elbowF = lerp(0.4, elbowF, s); armB = lerp(-0.3, armB, s);
      bodyY = lerp(0.5, bodyY, s); lean = lerp(-0.05, lean, s); legSpread = lerp(1.25, legSpread, s); sx = lerp(1, sx, s); sy = lerp(1, sy, s);
    }
    // отдача: ствол задирается, корпус откидывается назад, плащ летит вперёд
    elbowF += 0.85 * rec; armF += 0.12 * rec; armB += 0.55 * rec;
    lean -= 0.5 * rec; bodyY -= 1.9 * rec; headTilt -= 0.25 * rec; sx -= 0.07 * rec; sy += 0.05 * rec;
    let cloak = 0.9 * rec - 0.15;
    // перелом стволов и перезарядка: ствол вниз, свободная кисть к поясу за патроном, затем стволы защёлкиваются
    if (ph === "recovery") {
      const r = k.r;
      const brk = easeInOut(clamp((r - 0.12) / 0.28, 0, 1)) * (1 - easeOut(clamp((r - 0.72) / 0.28, 0, 1)));
      const belt = easeInOut(clamp((r - 0.2) / 0.3, 0, 1)) * (1 - easeOut(clamp((r - 0.68) / 0.3, 0, 1)));
      elbowF -= 1.05 * brk; armB = lerp(armB, 0.35, belt);
      bodyY += 0.6 * brk; headTilt += 0.18 * brk;
    }
    Object.assign(P, { armF, elbowF, armB, lean, headTilt, sx, sy, wBlend: P.wBlend || 0, cloak });
    if (p.onGround) Object.assign(P, { bodyY, legSpread });
  }

  /* ---------------------------------------------------------------- Обрез: набор */
  const SAWED_MOD = { pellets: 5, range: 520, pspread: 0.18, muzzle: 13, recoil: 60 };
  registerKit("sawed", {
    moves: {
      // сильная доля, точно: два залпа подряд — первый ствол на доле, второй на полдоле
      duplet: Object.assign({
        kind: "ranged", name: "Дуплет", startup: 0.06, active: 0.02, recovery: 0.3, cancel: 0.2, dmg: 20, speed: 900, knock: 220, stun: 0.3,
        update(cs, p, act) {
          if (!act.kInit) { act.kInit = true; extendForHalf(act); }
          if ((act.shotsFired || 0) >= 1) secondBarrel(cs, p, act);
        },
        pose(P, act) {      // второй ствол бьёт сильнее первого
          if (!act.kDone || act.kLast == null) return;
          const x = Math.exp(-(act.t - act.kLast) * 9);
          P.elbowF += 0.45 * x; P.lean -= 0.18 * x; if (P.bodyY != null) P.bodyY -= 0.6 * x; P.cloak += 0.4 * x;
        },
      }, SAWED_MOD),
      // враг вплотную сразу после стрельбы: приклад в корпус (на доле), затем залп в упор (на полдоле)
      buttstock: Object.assign({
        kind: "custom", name: "Удар прикладом", late: true, startup: 0.07, active: 0.02, recovery: 0.3, cancel: 0.2, dmg: 25, speed: 900, knock: 300, stun: 0.5, moveControl: 0.2,
        update(cs, p, act) {
          const g = cs.game;
          if (!act.kInit) { act.kInit = true; extendForHalf(act); }
          p.pistolT = Math.max(p.pistolT, 0.7);
          if (!act.kHit && act.t >= act.startup) {
            act.kHit = true;
            const reach = 62, box = { x: act.dir > 0 ? p.x - 4 : p.x - reach + 4, y: p.y - 34, w: reach, h: 36 };
            const hx = p.x + act.dir * 20;
            for (const e of g.enemies) {
              if (!e.targetable) continue;
              const eb = { x: e.x - e.w * e.scale / 2, y: e.y - e.h * e.scale, w: e.w * e.scale, h: e.h * e.scale };
              if (!rectsOverlap(box, eb)) continue;
              act.hit.add(e.id);
              act.dmgK = 0.34;         // приклад ≈ треть урона залпа
              cs._applyHit(e, act, act.dir, hx, e.centerY);
              act.dmgK = 1;
            }
            p.vx = act.dir * 80;
            g.sfx("hit", 1.15); g.camera.shake(0.18);
            g.fx.ring(hx, p.y - 18, 3, 22, "#ffffff", 0.18, 2);
            g.fx.sparks(hx, p.y - 18, 5, p.skin.accent, 200, act.dir > 0 ? 0 : Math.PI, 1.0, 0.2);
            act.kLast = null;
          }
          if (act.kHit) secondBarrel(cs, p, act);
        },
        pose(P, act, p, k) {
          if (act.kDone) return;
          const aim = gunAim(act, p), tHit = act.startup, tB = act.startup + (act.kHalf || 0.25), t = act.t;
          if (t < tHit) {              // замах: ружьё развёрнуто прикладом вперёд, рука за спиной
            const s = easeOut(k.s);
            Object.assign(P, { armF: lerp(0.3, -1.15, s), elbowF: lerp(0.4, 0.35, s), armB: lerp(-0.3, 0.5, s), wBlend: 1, wAngle: Math.PI, lean: lerp(0, -0.22, s), bodyY: 2.4 * s, legSpread: 1.8, headTilt: 0.1 });
          } else if (t < tHit + 0.1) { // удар: рука вперёд, корпус в выпад
            const u = easeOut((t - tHit) / 0.1);
            Object.assign(P, { armF: lerp(-1.15, 1.6, u), elbowF: 0.1, armB: lerp(0.5, -0.9, u), wBlend: 1, wAngle: Math.PI, lean: lerp(-0.22, 0.5, u), bodyY: 2.4, sx: 1.13, sy: 0.9, legSpread: 2.1, cloak: -1 });
          } else {                     // ружьё переворачивается стволом вперёд — залп в упор
            const u = easeInOut(clamp((t - tHit - 0.1) / Math.max(0.05, tB - tHit - 0.13), 0, 1));
            Object.assign(P, { armF: lerp(1.6, aim - 0.55, u), elbowF: lerp(0.1, 0.55, u), armB: lerp(-0.9, aim - 0.3, u), wBlend: 1 - u * u, wAngle: lerp(Math.PI, TAU, u), lean: lerp(0.5, 0.14, u), bodyY: 2.2, sx: lerp(1.13, 1.03, u), sy: lerp(0.9, 0.96, u), legSpread: 1.9 });
          }
        },
      }, SAWED_MOD),
    },
    // сильная доля + точно: двойной выстрел становится «Дуплетом» (залп на доле и на полдоле)
    choose(cs, name, ctx) {
      if (name === "twin" && !ctx.air && ctx.dx < 330) return "duplet";
    },
    pose: sawedPose,
    takedown(cs, kind) { return kind === "colossus" ? null : "sawed_blast"; },
  });

  // «Удар прикладом»: вплотную после стрельбы (общая логика здесь выбирает ближний бой — подменяем в обёртке)
  {
    const choose0 = CombatSystem.prototype.chooseAttack;
    CombatSystem.prototype.chooseAttack = function (target, j) {
      const name = choose0.call(this, target, j);
      const g = this.game, p = g.player;
      const k = ATTACKS[name];
      // подменяет и общий ближний приём, и приём набора ближнего оружия (напр. «Теневой шаг» кинжала):
      // условие приклада (сразу после выстрела, враг вплотную) конкретнее
      const meleeName = k && (k.kit ? WEAPONS[k.kit].slot === "melee" : k.kind === "melee" || k.kind === "dash");
      if (target && meleeName && weaponOf("gun", g.settings.v).id === "sawed"
        && p.onGround && (j.rating === "perfect" || j.rating === "good") && this.time - this.lastActionT < 0.9
        && this.lastAction && ATTACKS[this.lastAction].kind === "ranged" && !(p.counterT > 0)) {
        const dx = Math.abs(target.x - p.x) - (target.w * target.scale) / 2 - p.w / 2;
        if (dx < 52 && Math.abs(target.centerY - p.centerY) < 40) return "buttstock";
      }
      return name;
    };
  }

  /* ---------------------------------------------------------------- Револьвер: позы */
  function revolverPose(P, act, p, k) {
    const def = act.def;
    if (def.kind !== "ranged" && !def.kit) return;
    const aim = gunAim(act, p), ph = act.phase, since = sinceFire(act);
    const rec = since >= 0 ? Math.exp(-since * 6.5) : 0;        // отдача медленнее, чем у обреза: тяжёлый ствол долго «гуляет»
    // вытянутая рука с прицелом, свободная рука за спиной в равновесии
    let armF = aim - 0.05, elbowF = 0, armB = -0.45;
    let lean = 0.07, bodyY = 1.1, legSpread = 1.55, headTilt = -0.05, sx = 1, sy = 0.99;
    if (ph === "startup") {
      const s = easeOut(k.s);
      armF = lerp(0.3, armF, s) + 0.06 * Math.sin(s * Math.PI);        // рука подходит и чуть «ловит» цель
      armB = lerp(-0.3, armB, s); bodyY = lerp(0.5, bodyY, s); lean = lerp(-0.04, lean, s); legSpread = lerp(1.25, legSpread, s);
    }
    // мощная отдача вверх: рука и кисть откидываются, корпус назад, свободная рука отлетает
    armF += 0.6 * rec; elbowF += 0.4 * rec; armB -= 0.55 * rec;
    lean -= 0.3 * rec; bodyY -= 1.0 * rec; headTilt += 0.12 * rec; sy += 0.03 * rec;
    let cloak = 0.6 * rec - 0.1;
    if (ph === "recovery") {
      const r = k.r;
      // взвод курка: свободная ладонь накрывает курок (большой палец), затем рука опускается в «готовность»
      const cock = Math.sin(Math.PI * clamp((r - 0.22) / 0.5, 0, 1));
      armB = lerp(armB, armF - 0.08, cock);
      armF = lerp(armF, aim - 0.3, easeInOut(clamp((r - 0.55) / 0.45, 0, 1)));
      // после серии (3+ выстрела подряд) — прокрутка револьвера на пальце
      if (act.kSeries) {
        const e = easeOut(clamp((r - 0.05) / 0.2, 0, 1)) * (1 - easeOut(clamp((r - 0.9) / 0.1, 0, 1)));
        const kk = easeInOut(clamp((r - 0.08) / 0.84, 0, 1));
        armF = lerp(armF, 1.05, e); elbowF = lerp(elbowF, 0.7, e); armB = lerp(armB, -0.3, e); lean = lerp(lean, 0, e);
        P.wBlend = e; P.wAngle = TAU * kk;
      }
    }
    Object.assign(P, { armF, elbowF, armB, lean, headTilt, sx, sy, cloak });
    if (p.onGround) Object.assign(P, { bodyY, legSpread });
  }

  /** Пуля-луч: тонкий трассер от дула к точке (цветной контур + белая сердцевина). */
  const traceLine = (g, x0, y0, x1, y1, col, w, life) => {
    g.fx.cut(x0, y0, x1, y1, col, w * 2.2, life);
    g.fx.cut(x0, y0, x1, y1, "#ffffff", w * 0.8, life * 0.75);
  };

  /* ---------------------------------------------------------------- Револьвер: набор */
  const REV_MOD = { pr: 4, muzzle: 11, speed: 1100 };
  registerKit("revolver", {
    moves: {
      // сильная доля, точно, грув ≥ 2: шесть быстрых выстрелов по всем врагам впереди; ладонь хлопает по курку
      fanning: Object.assign({
        kind: "ranged", name: "Веер курка", startup: 0.06, active: 0.26, recovery: 0.3, cancel: 0.36, dmg: 4, knock: 70, stun: 0.12, scoreK: 0.5,
        update(cs, p, act) {
          const g = cs.game, low = g.fx.low;
          if (!act.kInit) { act.kInit = true; act.kSeries = true; act.shotsFired = 1; act.fired = true; act.kN = 0; act.kList = enemiesAhead(g, p, act.dir, 600).slice(0, 6); }
          p.pistolT = Math.max(p.pistolT, 0.7);
          // выстрелы считаем лучами (пули ближнего врага не закрывают дальних): n-й — в n-го врага по кругу
          while (act.kN < 6 && act.t >= act.startup + act.kN * 0.045) {
            const n = act.kN++, live = act.kList.filter(e => e.targetable);
            act.kLast = act.t;
            if (!live.length) continue;
            const e = live[n % live.length], hand = CharacterRenderer.handWorld(p, act.def.muzzle || 11);
            act.target = e;
            traceLine(g, hand.x, hand.y, e.x, e.centerY, p.skin.accent, 0.9, 0.16);
            g.fx.sparks(hand.x, hand.y, 3, p.skin.accent, 200, Math.atan2(e.centerY - hand.y, e.x - hand.x), 0.6, 0.15);
            if (!low && n % 2 === 0) g.fx.glow(hand.x, hand.y, 2, 12, "#ffffff", 0.07, 0.45);
            if (n) g.sfx("shot", false);
            g.camera.kick(0.004);
            cs._applyHit(e, act, sign(e.x - p.x) || act.dir, e.x, e.centerY);
          }
        },
        pose(P, act, p, k) {
          const aim = gunAim(act, p), slap = act.phase === "active" ? 0.5 + 0.5 * Math.cos(TAU * (act.t - act.startup) / 0.045) : 0;
          const rec = Math.exp(-Math.max(0, sinceFire(act)) * 15);
          if (act.phase === "startup") { P.armB = lerp(-0.3, aim - 1.0, easeOut(k.s)); Object.assign(P, { lean: 0.2, bodyY: 1.7, legSpread: 1.8 }); }
          else if (act.phase === "active") Object.assign(P, { armF: aim + 0.3 * rec, elbowF: 0.15 * rec, armB: lerp(aim - 1.05, aim - 0.04, slap), lean: 0.2 - 0.12 * rec, bodyY: 1.7, legSpread: 1.8, sx: 1.04 });
        },
      }, REV_MOD),
      // точный выстрел: пуля бьёт цель, отскакивает от пола и бьёт второго врага
      ricochet: Object.assign({
        kind: "ranged", name: "Рикошет", startup: 0.06, active: 0.15, recovery: 0.32, cancel: 0.18, dmg: 15, knock: 160, stun: 0.3,
        update(cs, p, act) {
          const g = cs.game, low = g.fx.low;
          if (!act.kInit) { act.kInit = true; act.shotsFired = 1; act.fired = true; }     // встроенный выстрел отключён: луч считаем сами
          p.pistolT = Math.max(p.pistolT, 0.7);
          const A = act.target;
          if (!act.kShot && act.t >= act.startup) {
            act.kShot = true; act.kLast = act.t;
            const hand = CharacterRenderer.handWorld(p, act.def.muzzle || 11);
            if (A) {
              traceLine(g, hand.x, hand.y, A.x, A.centerY, p.skin.accent, 1.2, 0.2);
              // второй враг для рикошета — ближайший к первому
              let B = null, bd = 460;
              for (const e of g.enemies) if (e !== A && e.targetable) { const d = Math.abs(e.x - A.x); if (d < bd) { bd = d; B = e; } }
              act.kB = B;
              g.fx.sparks(hand.x, hand.y, 6, p.skin.accent, 250, Math.atan2(A.centerY - hand.y, A.x - hand.x), 0.7, 0.2);
              if (!low) g.fx.glow(hand.x, hand.y, 3, 18, "#ffffff", 0.1, 0.5);
              g.camera.kick(0.012);
              cs._applyHit(A, act, sign(A.x - p.x) || act.dir, A.x - act.dir * 4, A.centerY);
            }
          }
          if (act.kShot && !act.kBounce && act.kB && act.t >= act.startup + 0.07) {
            act.kBounce = true;
            const B = act.kB;
            if (!A || !B.targetable) return;
            const fx = (A.x + B.x) / 2, col = p.skin.accent;
            traceLine(g, A.x, A.centerY, fx, -2, col, 1.1, 0.22);
            traceLine(g, fx, -2, B.x, B.centerY, col, 1.1, 0.22);
            g.fx.ring(fx, -3, 3, 20, "#ffffff", 0.2, 2);
            g.fx.sparks(fx, -2, 6, col, 220, -PI2, 1.0, 0.22);
            g.fx.dust(fx, 0, low ? 2 : 4);
            if (!low) g.fx.glow(fx, -3, 3, 16, "#ffffff", 0.1, 0.5);
            g.sfx("bulletHit");
            cs._applyHit(B, act, sign(B.x - fx) || act.dir, B.x, B.centerY);
          }
        },
        pose(P, act, p) {      // свободная кисть «ведёт» пулю по рикошету
          const x = clamp((act.t - act.startup - 0.04) / 0.2, 0, 1);
          if (act.kShot) { P.armB = lerp(-0.5, 1.15, easeOut(Math.min(1, x * 1.6))) - 0.9 * easeIn(Math.max(0, x - 0.6) / 0.4); P.headTilt = 0.18 * Math.sin(x * Math.PI); }
        },
      }, REV_MOD),
    },
    choose(cs, name, ctx) {
      if (ctx.air || ctx.away || !ctx.target) return;
      const g = cs.game, j = ctx.j;
      const ahead = enemiesAhead(g, ctx.p, sign(ctx.target.x - ctx.p.x), 600);
      if (j.strong && ctx.good && cs.groove >= 2 && ahead.length) return "fanning";
      if (j.rating === "perfect" && g.enemies.filter(e => e.targetable && e !== ctx.target && Math.abs(e.x - ctx.target.x) < 460).length) return "ricochet";
    },
    pose: revolverPose,
    takedown(cs, kind) { return kind === "colossus" ? null : "revolver_duel"; },
  });

  /* ---------------------------------------------------------------- Обёртка хода действия (эффекты на фазах) */
  {
    const ua = CombatSystem.prototype.updateAction;
    CombatSystem.prototype.updateAction = function (p, act, dt) {
      ua.call(this, p, act, dt);
      const def = act.def, id = def.w && def.w.id;
      if ((id !== "sawed" && id !== "revolver") || (def.kind !== "ranged" && !def.kit)) return;
      const g = this.game, low = g.fx.low;
      if (!act.kInit0) {
        act.kInit0 = true; act.kSF = act.shotsFired | 0;
        // прокрутка после серии: 3-й и дальше выстрел подряд (у «Веера курка» — всегда); для неё восстановление чуть дольше
        if (id === "revolver" && (this.shotChain >= 3 || act.kSeries)) { act.kSeries = true; act.recovery += 0.14; act.total += 0.14; }
      }
      // момент последнего выстрела (для отдачи в позе)
      if ((act.shotsFired | 0) !== act.kSF) { act.kSF = act.shotsFired | 0; act.kLast = act.t; }
      if (act.phase !== "recovery") return;
      const r = clamp((act.t - act.startup - act.travel - act.active) / Math.max(0.01, act.recovery), 0, 1);
      if (id === "sawed" && !act.kEject && r > 0.3) {
        // перелом стволов: две стреляные гильзы падают на землю
        act.kEject = true;
        const h = CharacterRenderer.handWorld(p, 4);
        g.fx.shards(h.x, h.y, 2, "#d9482c", 90);
        if (!low) g.fx.smoke(h.x + act.dir * 8, h.y - 1, 1, "#4a4650", 0.5);
      } else if (id === "revolver") {
        if (!act.kCock && r > 0.4) {
          // курок взведён: щелчок и крошечная вспышка у барабана
          act.kCock = true;
          const h = CharacterRenderer.handWorld(p, 3);
          if (!low) g.fx.glow(h.x, h.y, 1.5, 7, "#ffffff", 0.08, 0.45);
          g.sfx("step");
        }
        if (!act.kSmoke && r > 0.1) {
          act.kSmoke = true;
          if (!low) { const h = CharacterRenderer.handWorld(p, def.muzzle || 11); g.fx.smoke(h.x, h.y, 1, "#5a5662", 0.6); }
        }
      }
    };
  }

  /* ---------------------------------------------------------------- Добивание обреза: «Дуплет в упор» */
  registerTakedown("sawed_blast", {
    name: "ДУПЛЕТ В УПОР", dur: 1.0, death: "shot",
    update(cs, td, api) {
      const g = cs.game, p = g.player, e = td.e, d = td.dir, t = api.t, low = api.low, col = api.col;
      p.pistolT = 0.8; p.y = td.py;
      const stand = clamp(td.ex - d * 26, 40, WORLD.w - 40);                      // вплотную к врагу
      const slide = 8 * easeOut(clamp((t - 0.36) / 0.12, 0, 1)) + 7 * easeOut(clamp((t - 0.58) / 0.12, 0, 1));   // откат от двух залпов
      p.x = t < 0.2 ? lerp(td.px, stand, easeInOut(t / 0.2)) : stand - d * slide;
      p.facing = d;
      // враг оглушён, после первого залпа его отшатывает
      if (t < 0.58) e.x = clamp(td.ex + d * 14 * easeOut(clamp((t - 0.36) / 0.1, 0, 1)), 40, WORLD.w - 40);
      e.tdPose = { lean: -0.2 - 0.35 * easeOut(clamp((t - 0.36) / 0.12, 0, 1)), bodyY: 1.5, headTilt: -0.3 };
      const muzzle = () => CharacterRenderer.handWorld(p, 13);
      const blast = (big) => {
        const h = muzzle(), ang = Math.atan2(cy() - h.y, e.x - h.x), len = Math.hypot(e.x - h.x, cy() - h.y);
        // пять тонких росчерков дроби веером, без толстых линий и россыпи частиц
        for (let i = 0; i < 5; i++) {
          const a = ang + (i - 2) * (big ? 0.11 : 0.08), L = len + 14 + (i % 2) * 10;
          traceLine(g, h.x, h.y, h.x + Math.cos(a) * L, h.y + Math.sin(a) * L, col, big ? 1.5 : 1.1, life(big ? 0.3 : 0.22));
        }
        if (!low) g.fx.glow(h.x, h.y, 5, big ? 46 : 34, "#ffffff", life(0.12), 0.55);
        g.fx.sparks(e.x, cy(), big ? 7 : 4, col, 220, d > 0 ? 0 : Math.PI, 1.1, 0.22);
        g.sfx("shot", true); g.sfx("bulletHit");
        e.flash = 0.6; e.hitKick = 1;
        g.camera.shake(big ? 0.4 : 0.26); g.camera.kick(big ? 0.03 : 0.018);
      };
      const life = api.life, cy = () => e.y - e.h * e.scale * 0.5;
      api.once("dash", 0.02, () => { api.streak(td.px, stand); g.sfx("dash"); });
      api.once("plant", 0.22, () => { g.fx.dust(p.x, p.y, low ? 2 : 4); g.sfx("step"); });
      api.once("b1", 0.36, () => { blast(false); g.hitstop(0.05); });
      api.once("b2", 0.58, () => {
        blast(true);
        g.fx.ring(e.x, cy(), 6, 52, "#ffffff", life(0.35), 1.6);
        api.finish();
        e.vx = d * 1500; e.vy = -120;                      // отбрасывает через пол-экрана
      });
      api.once("shell", 0.7, () => {                        // перелом стволов: гильзы и дымок
        const h = CharacterRenderer.handWorld(p, 4);
        g.fx.shards(h.x, h.y, 2, "#d9482c", 90);
        if (!low) g.fx.smoke(h.x + d * 8, h.y - 1, 2, "#4a4650", 0.6);
        g.sfx("step");
      });
      api.once("trail", 0.64, () => g.fx.cut(e.x, cy(), e.x - d * 70, cy(), td.e.look.accent, 2.4, life(0.3)));
      if (t > 0.6) g.camera.retarget(lerp(p.x, e.x, 0.5), e.centerY - 8, 1.2);       // камера идёт за полётом врага
    },
    pose(cs, p, td) {
      const t = td.t, e = td.e, ph = (a, b) => clamp((t - a) / (b - a), 0, 1);
      const ang = Math.atan2(e.centerY - (p.y - 20), Math.abs(e.x - p.x)), aim = PI2 - ang;
      const k1 = t >= 0.36 ? Math.exp(-(t - 0.36) * 11) : 0, k2 = t >= 0.58 ? Math.exp(-(t - 0.58) * 9) : 0, kick = Math.max(k1 * 0.8, k2 * 1.25);
      let P;
      if (t < 0.22) {          // рывок: ружьё у бедра, корпус вперёд
        const k = easeOut(ph(0, 0.1));
        P = { armF: lerp(0.35, 0.95, k), elbowF: lerp(0.4, 0.55, k), armB: lerp(-0.3, 0.8, k), lean: 0.5 * k, bodyY: 2.5 * k, legSpread: 2, sx: 1.12, sy: 0.9, cloak: -1 };
      } else if (t < 0.36) {   // пауза в упор: ствол поднимается на уровень груди
        const k = easeInOut(ph(0.22, 0.34));
        P = { armF: lerp(0.95, aim - 0.45, k), elbowF: lerp(0.55, 0.5, k), armB: lerp(0.8, aim - 0.25, k), lean: lerp(0.5, 0.2, k), bodyY: 2.5, legSpread: 2, sx: lerp(1.12, 1.04, k), sy: lerp(0.9, 0.95, k), cloak: lerp(-1, 0, k) };
      } else if (t < 0.7) {    // два залпа: корпус откидывает назад
        P = { armF: aim - 0.45 + 0.2 * kick, elbowF: 0.5 + 1.0 * kick, armB: aim - 0.25 + 0.5 * kick, lean: 0.2 - 0.5 * kick, bodyY: 2.5 - 1.8 * kick, legSpread: 2, sx: 1.04 - 0.06 * kick, sy: 0.95 + 0.05 * kick, cloak: 0.9 * kick, headTilt: -0.25 * kick };
      } else {                 // перелом стволов, патрон из-за пояса, защёлкнул, выпрямился
        const brk = easeInOut(ph(0.7, 0.78)) * (1 - easeOut(ph(0.9, 1.0))), belt = easeInOut(ph(0.74, 0.84)) * (1 - easeOut(ph(0.9, 1.0)));
        const k = easeInOut(ph(0.88, 1.0));
        P = { armF: lerp(aim - 0.25, 0.5, k), elbowF: lerp(0.5, 0.5, k) - 1.0 * brk + 1.0 * kick * 0.3, armB: lerp(aim - 0.1, 0.35, belt) - 0.5 * k, lean: lerp(0.1, 0, k), bodyY: lerp(2.3, 0.3, k), legSpread: lerp(1.9, 1.2, k), headTilt: 0.2 * brk, cloak: 0.3 * k2 };
      }
      return P;
    },
  });

  /* ---------------------------------------------------------------- Добивание револьвера: «Дуэль» */
  registerTakedown("revolver_duel", {
    name: "ДУЭЛЬ", dur: 1.3, death: "shot",
    update(cs, td, api) {
      const g = cs.game, p = g.player, e = td.e, d = td.dir, t = api.t, low = api.low, life = api.life;
      p.pistolT = 0.8; p.x = td.px; p.y = td.py;
      // лицом к врагу; разворот спиной на 0.30–0.42; в конце снова к врагу
      p.facing = t < 0.36 ? d : t < 1.12 ? -d : d;
      const cy = e.y - e.h * e.scale * 0.5;
      // враг тянется к оружию, но не успевает; после выстрела держится стандартная поза «оглушён»
      if (t < 0.54) e.tdPose = { lean: 0.05 + 0.12 * ph(t, 0.3, 0.52), armF: lerp(0.5, 1.5, easeIn(ph(t, 0.3, 0.52))), elbowF: 0.3, armB: -0.2, headTilt: 0.05 };
      api.once("glint", 0.2, () => { if (!low) g.fx.glow(e.x, cy - 4, 1.5, 10, "#ffffff", life(0.16), 0.5); });     // блик в глазах врага — сигнал
      api.once("turn", 0.32, () => { g.sfx("dash"); g.fx.dust(p.x, p.y, low ? 1 : 3); });
      api.once("shot", 0.54, () => {      // выстрел через плечо
        cs._tracer(p, e, 2.2, true);
        g.hitstop(0.05);
        api.finish();
        e.vx = d * 520; e.vy = -90;
      });
      api.once("smoke", 0.6, () => { if (!low) { const h = CharacterRenderer.handWorld(p, 11); g.fx.smoke(h.x, h.y, 2, "#5a5662", 0.8); } });
      api.once("spinSnd", 0.7, () => g.sfx("step"));
      api.once("holster", 1.0, () => { g.sfx("step"); const h = CharacterRenderer.handWorld(p, 3); if (!low) g.fx.glow(h.x, h.y, 2, 9, "#ffffff", life(0.1), 0.45); });
      api.once("turnBack", 1.12, () => g.fx.dust(p.x, p.y, low ? 1 : 2));
      function ph(x, a, b) { return clamp((x - a) / (b - a), 0, 1); }
    },
    pose(cs, p, td) {
      const t = td.t, ph = (a, b) => clamp((t - a) / (b - a), 0, 1);
      const kick = t >= 0.54 ? Math.exp(-(t - 0.54) * 7) : 0;
      if (t < 0.3) {           // дуэльная пауза: неподвижно, рука у кобуры, плащ колышется
        return { armF: 0.18 + 0.03 * Math.sin(t * 30), elbowF: 0.3, armB: -0.2, lean: 0.04, bodyY: 1.2, legSpread: 1.5, headTilt: -0.06, cloak: 0.7 };
      }
      if (t < 0.42) {          // разворот спиной: силуэт сужается на развороте
        const k = ph(0.3, 0.42);
        // разворот спиной — поворот вокруг оси; с 0,36 с update уже развернул p.facing, поэтому угол отсчитывается от нового направления
        const th = 0.5 * easeInOut(k);
        return { armF: 0.18, elbowF: 0.3, armB: -0.2, lean: 0.04, bodyY: 1.6, legSpread: 1.7, turn: t < 0.36 ? th : th - 0.5, cloak: 1.1, headTilt: -0.1 };
      }
      if (t < 0.54) {          // рука с револьвером откидывается назад-вверх, взгляд через плечо
        const k = easeOut(ph(0.42, 0.53));
        return { armF: lerp(0.18, -1.5, k), elbowF: lerp(0.3, 0, k), armB: lerp(-0.2, 0.4, k), lean: lerp(0.04, 0.12, k), bodyY: 1.6, legSpread: 1.7, headTilt: -0.15 * k, cloak: 0.4 };
      }
      if (t < 0.66) {          // отдача: ствол взлетает вверх
        return { armF: -1.5 - 0.85 * kick, elbowF: -0.45 * kick, armB: 0.4 - 0.6 * kick, lean: 0.12 - 0.22 * kick, bodyY: 1.6 - 0.9 * kick, legSpread: 1.7, headTilt: 0.12 * kick, cloak: 0.5 * kick };
      }
      if (t < 1.0) {           // прокрутка револьвера на пальце над плечом
        const k = easeInOut(ph(0.66, 0.98)), e = easeOut(ph(0.66, 0.74));
        return { armF: lerp(-2.2, -1.9, e), elbowF: lerp(-0.2, 0.7, e), armB: lerp(0.0, -0.3, e), wBlend: 1, wAngle: TAU * 2 * k, lean: 0.02, bodyY: 1.2, legSpread: 1.5, headTilt: 0.05 };
      }
      if (t < 1.12) {          // револьвер в кобуру: рука к бедру
        const k = easeInOut(ph(1.0, 1.12));
        return { armF: lerp(-1.9, 0.2, k), elbowF: lerp(0.7, 0.35, k), armB: lerp(-0.3, -0.2, k), wBlend: 1 - k, wAngle: TAU * 2, lean: 0, bodyY: 1.2, legSpread: 1.5, sx: lerp(1, 0.35, easeIn(ph(1.04, 1.12))) };
      }
      const k = ph(1.12, 1.3);   // разворот лицом и выдох
      return { armF: 0.2, elbowF: 0.35, armB: -0.25, lean: -0.03 * k, bodyY: lerp(1.2, 0.2, easeOut(k)), legSpread: lerp(1.5, 1.15, k), sx: lerp(0.35, 1, easeOut(clamp(k * 3, 0, 1))), cloak: 0.4 * (1 - k) };
    },
  });
}
