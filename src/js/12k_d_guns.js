/* =====================================================================
   Наборы огнестрела, часть 2 (kits, см. 12d_kits): «Парные автоматы» (smg), «Рельсовый карабин» (rail),
   «Неоновый пистолет» (pistol). У каждого — свои анимации всех выстрелов (kit.pose), по две комбинации (moves + choose)
   и своё добивание (takedown + registerTakedown). Всё в блоке {} — локальные имена с префиксом kd.

   Комбинации (имя в ATTACKS → подпись):
     smgStorm    «Шквал свинца»   — сильная доля + точно + грув ≥ 2: 8 пуль по очереди, цели чередуются (веер по всем впереди)
     smgCarousel «Карусель»       — враги с двух сторон + точно: передний ствол стреляет в одну сторону, задний — в другую, на середине разворот
     railBeam    «Заряженный луч» — 3-й выстрел подряд в такт: зарядка и сплошной луч через всю арену, бьёт всех на линии
     railButt    «Удар прикладом» — враг вплотную при отходе (там, где обычно «Отскок-выстрел») + точно: приклад (отброс), затем выстрел навылет
     pistolDtap  «Дабл-тап»       — нажатие на «и» сразу после выстрела: пуля на «и», вторая — на следующую долю в ту же точку
     pistolBlind «Вслепую»        — точное нажатие, когда враг за спиной: выстрел через плечо без разворота
   Урон за нажатие ≈ существующим комбинациям огнестрела (веер/заряженный/двойной) ±15%.
   ===================================================================== */
{
  const KD_HALF = Math.PI / 2;

  /* ---------- помощники ---------- */
  /** Угол прицеливания героя на цель act.target (0 — горизонтально), как в actionPose. */
  const kdAim = (act, p) => { const tg = act.target; return tg ? Math.atan2(tg.centerY - (p.y - 20), Math.abs(tg.x - p.x)) : 0; };
  /** Ход очереди: номер текущего выстрела (−1 — ещё не стреляли) и «отдача» 0..1 от последнего. */
  const kdBurst = (act, dur) => {
    const def = act.def, shots = def.shots || 1, gap = def.gap || 0, t0 = act.startup + (def.fireAt || 0);
    if (act.t < t0) return { idx: -1, kick: 0 };
    const idx = gap > 0 ? Math.min(shots - 1, Math.floor((act.t - t0) / gap)) : 0;
    return { idx, kick: Math.max(0, 1 - (act.t - t0 - idx * gap) / dur) };
  };
  const kdSince = (cs, key) => cs.time - (cs[key] === undefined ? -9 : cs[key]);
  /** Кисть задней руки (дуло второго ствола): тот же расчёт, что handWorld, но по задней руке. */
  const kdTmpPose = {};
  const kdTmpCh = { kind: "player", x: 0, y: 0, facing: 1, scale: 1, anim: { pose: kdTmpPose } };
  const kdBackHand = (p, extra) => {
    Object.assign(kdTmpPose, p.anim.pose);
    kdTmpPose.armF = kdTmpPose.armB; kdTmpPose.elbowF = 0.5; kdTmpPose.wBlend = 0;
    kdTmpCh.x = p.x; kdTmpCh.y = p.y; kdTmpCh.facing = p.facing; kdTmpCh.scale = p.scale;
    return CharacterRenderer.handWorld(kdTmpCh, extra);
  };
  /** Ближний живой враг на стороне s (−1/+1). */
  const kdSide = (g, p, s) => {
    let best = null, bd = 520;
    for (const e of g.enemies) {
      if (!e.targetable) continue;
      const dx = e.x - p.x;
      if (sign(dx) !== s || Math.abs(dx) > bd || Math.abs(e.centerY - p.centerY) > 160) continue;
      bd = Math.abs(dx); best = e;
    }
    return best;
  };
  const kdAhead = (g, p, s) => g.enemies.filter(e => e.targetable && sign(e.x - p.x) === s && Math.abs(e.x - p.x) < 560 && Math.abs(e.centerY - p.centerY) < 200)
    .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
  /** Конец луча из точки (x, y) по направлению (dx, dy) до края арены. */
  const kdBeamEnd = (x, y, dx, dy) => {
    const lim = dx > 0 ? (WORLD.w + 40 - x) / Math.max(dx, 1e-3) : (-40 - x) / Math.min(dx, -1e-3);
    const t = Math.min(lim, 2200);
    return { x: x + dx * t, y: y + dy * t, t };
  };

  /* ---------- отрисовка: второй автомат в задней руке, подсветка зарядки карабина ---------- */
  // один компактный автомат с началом в (ox, oy); те же формы, что у WD_SMG (12b)
  const kdSmgGun = (ctx, ox, oy, accent, body) => {
    ctx.fillStyle = body;
    ctx.fillRect(ox - 1.5, oy - 1.3, 8.5, 2.5);
    ctx.fillRect(ox + 7, oy - 0.9, 3, 0.8);
    ctx.fillRect(ox - 0.4, oy + 1.1, 1.7, 2.8);
    ctx.fillRect(ox + 3.2, oy + 1.1, 1.4, 3.4);
    ctx.fillStyle = accent; ctx.fillRect(ox + 1, oy - 0.7, 4, 0.5);
    ctx.fillRect(ox + 9.6, oy - 1, 0.7, 1);
  };
  const kdSmgOrig = WEAPON_DRAW.smg.draw;
  WEAPON_DRAW.smg.draw = function (ctx, ch, p, accent, hq) {
    // в бою (у героя есть pistolT) — по автомату в каждой руке; на карточках «Арсенала» и в листах — прежний вид
    if (ch.pistolT === undefined) { kdSmgOrig.call(this, ctx, ch, p, accent, hq); return; }
    kdSmgGun(ctx, 0, 0, accent, "#14151b");
    const hipY = -9 + p.bodyY, fa = p.armF, fe = p.elbowF;
    const fx = 1 + Math.sin(fa) * 6 + Math.sin(fa + fe) * 6, fy = hipY - 9 + Math.cos(fa) * 6 + Math.cos(fa + fe) * 6;
    const bx = 1 + Math.sin(p.armB) * 6 + Math.sin(p.armB + 0.5) * 6, by = hipY - 9 + Math.cos(p.armB) * 6 + Math.cos(p.armB + 0.5) * 6;
    let dx = Math.sin(fa + fe), dy = Math.cos(fa + fe);
    if (p.wBlend > 0) { dx = lerp(dx, Math.cos(p.wAngle), p.wBlend); dy = lerp(dy, Math.sin(p.wAngle), p.wBlend); }
    const thF = Math.atan2(dy, dx), c = Math.cos(thF), s = Math.sin(thF), rx = bx - fx, ry = by - fy;
    ctx.save();
    ctx.translate(rx * c + ry * s, -rx * s + ry * c);
    ctx.rotate(KD_HALF - (p.armB + 0.5) - thF);
    kdSmgGun(ctx, 0, 0, accent, "#0d0e12");
    ctx.restore();
  };
  const kdRailOrig = WEAPON_DRAW.rail.draw;
  WEAPON_DRAW.rail.draw = function (ctx, ch, p, accent, hq) {
    kdRailOrig.call(this, ctx, ch, p, accent, hq);
    // зарядка: направляющие и катушки разгораются, у дула растёт точка света (метка свежая — иначе забытое значение не светит)
    const ch0 = ch.kdCharge;
    if (!ch0 || performance.now() - ch.kdChargeAt > 160) return;
    ctx.globalAlpha *= 0.35 + 0.65 * ch0;
    ctx.fillStyle = accent; ctx.fillRect(7, -1.5, 12.5, 0.6); ctx.fillRect(7, 0.2, 12.5, 0.6);
    ctx.fillStyle = "#ffffff";
    for (const x of WD_RAIL) ctx.fillRect(x + 0.1, -2.1, 0.7, 0.8 + 2.4 * ch0);
    ctx.beginPath(); ctx.arc(20.2, -0.4, 0.8 + 2.6 * ch0, 0, TAU); ctx.fillStyle = rgba(accent, 0.55); ctx.fill();
    ctx.beginPath(); ctx.arc(20.2, -0.4, 0.5 + 1.1 * ch0, 0, TAU); ctx.fillStyle = "#ffffff"; ctx.fill();
    ctx.globalAlpha = 1;
  };

  /* =====================================================================
     ПАРНЫЕ АВТОМАТЫ
     ===================================================================== */
  const smgPose = (P, act, p, k) => {
    const def = act.def;
    if (def.kind !== "ranged" && def.kind !== "custom") return;
    const ang = kdAim(act, p), aim = KD_HALF - ang;
    const b = kdBurst(act, 0.09), t = act.t;
    const odd = b.idx >= 0 && b.idx % 2 === 1;            // стреляет задний ствол
    const raise = easeOut(clamp(t / Math.max(0.03, act.startup), 0, 1));
    // крест-накрест: руки сходятся и расходятся, ствол, который стреляет, подбрасывает вверх
    const x = b.idx < 0 ? 0 : odd ? -1 : 1;
    const multi = (def.shots || 1) > 1;
    let aF = lerp(0.3, aim + 0.16 * x, raise) + (odd ? 0 : b.kick * 0.3);
    let aB = lerp(-0.55, aim - 0.5 - 0.16 * x, raise) + (odd ? b.kick * 0.3 : 0);
    // тряска очереди: частая мелкая дрожь корпуса пока идёт стрельба, разворот корпуса между стволами
    const live = b.idx >= 0 && act.phase !== "recovery" ? 1 : act.phase === "recovery" ? Math.max(0, 1 - k.r * 2.5) : 0;
    const shake = Math.sin(t * 115) * 0.42 * live * (multi ? 1 : 0.5);
    P.bodyY = 1.8 + shake + b.kick * 0.5;
    P.legSpread = 1.75; P.sy = 1 - 0.03 * live;
    P.lean = 0.07 + (x ? -0.05 * x : 0) * live - b.kick * 0.06;
    P.sx = 1 + 0.045 * x * live;
    P.headTilt = -0.05 * x;
    if (def.hip) { aF = lerp(0.2, aim + 0.25, raise) + b.kick * 0.25; aB = lerp(-0.5, aim - 0.3, raise); P.lean = 0.2; P.bodyY = 2.4 + shake; P.legSpread = 1.9; }
    // смена магазинов: на восстановлении задняя рука уходит к поясу и «хлопает», передняя опускается
    if (act.phase === "recovery") {
      const rl = easeInOut(clamp((k.r - 0.1) / 0.6, 0, 1)) * (multi ? 1 : 0.7);
      aB = lerp(aB, 0.15 + 0.28 * Math.sin(k.r * Math.PI * 4), rl);
      aF = lerp(aF, 0.85, rl * 0.8);
      P.headTilt = 0.12 * rl; P.bodyY = 1.8 - 0.4 * rl;
    }
    if (act.name === "smgStorm") {        // шквал: корпус подан вперёд, стволы водят веером вверх-вниз
      const sw = Math.sin(t * 40) * 0.14 * live;
      aF += sw; aB -= sw; P.lean = 0.16; P.bodyY = 2.4 + shake; P.legSpread = 2.0;
    }
    P.armF = aF; P.elbowF = 0; P.armB = aB;
    P.wBlend = 0;
  };

  /** Задний ствол «Карусели»: поза руки назад на другого врага, сжатие корпуса на развороте. */
  const smgCarouselPose = (P, act, p, k) => {
    const tg = act.kdTgB, hy = p.y - 20;
    const angB = tg ? Math.atan2(tg.centerY - hy, Math.abs(tg.x - p.x)) : 0;
    const b = kdBurst(act, 0.09);
    P.armB = angB - KD_HALF - 0.5 - b.kick * 0.3;
    if (act.phase === "recovery") P.armB = lerp(P.armB, 0.2, easeInOut(clamp((k.r - 0.1) / 0.6, 0, 1)));
    const ds = act.t - act.kdFlipT;
    const turn = act.kdFlip && ds >= 0 && ds < 0.09 ? Math.sin(Math.PI * ds / 0.09) : 0;
    P.sx = (P.sx || 1) * (1 - 0.55 * turn);
    P.bodyY = (P.bodyY || 0) + 0.8; P.legSpread = 1.95;
    P.lean = 0.02; P.headTilt = 0.1 * Math.sin(act.t * 22);
  };

  const smgBoth = (cs, p) => { const g = cs.game; return kdSide(g, p, -1) && kdSide(g, p, 1); };

  registerKit("smg", {
    pose: smgPose,
    moves: {
      smgStorm: {
        kind: "ranged", startup: 0.05, active: 0.36, recovery: 0.2, cancel: 0.42, dmg: 3.5, speed: 1050, knock: 45, stun: 0.1,
        shots: 8, gap: 0.045, burst: true, scoreK: 0.5, pr: 2.7, muzzle: 9, spread: 0.02, pierce: true, moveControl: 0.3, name: "Шквал свинца",
        update(cs, p, act) {
          if (!act.kdInit) { act.kdInit = true; cs.kdStormT = cs.time; p.pistolT = 0.9; act.kdN = -1; }
          // каждая следующая пуля — по следующему врагу впереди (по кругу): очередь разметает всех
          const n = act.shotsFired || 0;
          if (n < act.def.shots && n !== act.kdN) {
            act.kdN = n;
            const list = kdAhead(cs.game, p, act.dir);
            if (list.length) act.target = list[n % list.length];
          }
        },
      },
      smgCarousel: {
        kind: "ranged", startup: 0.05, active: 0.4, recovery: 0.2, cancel: 0.46, dmg: 3.9, speed: 1000, knock: 50, stun: 0.1,
        shots: 6, gap: 0.06, burst: true, scoreK: 0.5, pr: 2.7, muzzle: 9, moveControl: 0.2, name: "Карусель",
        pose: smgCarouselPose,
        update(cs, p, act) {
          const g = cs.game, def = act.def, col = p.skin.accent;
          if (!act.kdInit) { act.kdInit = true; cs.kdCarT = cs.time; p.pistolT = 0.9; act.kdB = 0; act.kdFlip = false; act.kdFlipT = -9; }
          const n = act.shotsFired || 0;
          // на середине очереди — разворот: передний ствол теперь смотрит в другую сторону
          if (n >= def.shots / 2 && !act.kdFlip) {
            act.kdFlip = true; act.kdFlipT = act.t; act.dir = -act.dir; p.facing = act.dir;
            g.fx.ring(p.x, p.y - 18, 6, 34, col, 0.28, 2);
            g.sfx("dash");
          }
          act.target = kdSide(g, p, act.dir);
          act.kdTgB = kdSide(g, p, -act.dir);
          // задний ствол стреляет вместе с передним — в противоположную сторону
          while (act.kdB < n) {
            const h = kdBackHand(p, 9), tg = act.kdTgB;
            let ang = tg ? Math.atan2(tg.centerY - h.y, tg.x - h.x) : (act.dir > 0 ? Math.PI : 0);
            ang += (act.kdB % 2 ? 1 : -1) * 0.022;
            cs.spawnProjectile({ x: h.x, y: h.y, vx: Math.cos(ang) * def.speed, vy: Math.sin(ang) * def.speed, owner: "player", act, r: def.pr, color: col, life: 0.9, pierce: false });
            g.fx.sparks(h.x, h.y, 4, col, 240, ang, 0.7, 0.2);
            g.fx.ring(h.x, h.y, 2, 10, "#ffffff", 0.14, 2);
            if (act.kdB % 2 === 0) g.sfx("shot");
            act.kdB++;
          }
        },
      },
    },
    choose(cs, name, c) {
      const p = c.p;
      if (c.air || !c.target || name === "backShot") return;
      if (c.good && kdSince(cs, "kdCarT") > 1.4 && smgBoth(cs, p)) return "smgCarousel";
      if (c.good && c.j.strong && cs.groove >= 2 && kdSince(cs, "kdStormT") > 1.6) return "smgStorm";
    },
    takedown(cs, kind, e, act) { return kind === "colossus" ? null : "smgJuggle"; },
  });

  /** Пара тонких трассеров из руки в точку: цветной контур и белая сердцевина. */
  const kdTracer = (g, api, hx, hy, tx, ty, w) => {
    g.fx.cut(hx, hy, tx, ty, api.col, w * 2.2, api.life(0.16));
    g.fx.cut(hx, hy, tx, ty, "#ffffff", w * 0.8, api.life(0.12));
    if (!api.low) g.fx.glow(hx, hy, 2, 6 + w * 4, "#ffffff", api.life(0.1), 0.5);
  };

  const SMG_T0 = 0.12, SMG_GAP = 0.06, SMG_N = 8, SMG_FIN = 0.82;
  registerTakedown("smgJuggle", {
    name: "ВОЗДУШНЫЙ ШКВАЛ", dur: 1.12, death: "shot",
    update(cs, td, api) {
      const g = cs.game, p = g.player, e = td.e, t = api.t, d = td.dir, gnd = td.ey, H = 80;
      p.pistolT = 0.9; p.x = td.px; p.y = td.py; p.facing = d;
      if (t < SMG_FIN) {
        // очередь поднимает врага и держит в воздухе, затем он замирает под прицелом
        const k = easeOut(clamp((t - 0.1) / 0.5, 0, 1));
        e.y = gnd - H * k - (t > 0.6 ? 3 * Math.sin((t - 0.6) * 9) : 0);
        e.x = td.ex + d * 8 * k;
        e.tdPose = { lean: -0.35 * k, armF: -1.3, armB: -1.4, tuck: 0.7 * k, headTilt: -0.35 * k, bodyY: 1 };
      }
      const ecx = e.x, ecy = e.y - e.h * e.scale * 0.5;
      g.camera.retarget(lerp(p.x, e.x, 0.5), ecy - 4);
      for (let i = 0; i < SMG_N; i++) {
        api.once("s" + i, SMG_T0 + i * SMG_GAP, () => {
          const h = i % 2 ? kdBackHand(p, 9) : CharacterRenderer.handWorld(p, 9);
          kdTracer(g, api, h.x, h.y, ecx + (i % 2 ? -3 : 3), ecy + (i % 3 - 1) * 4, 0.8);
          g.fx.sparks(ecx, ecy, 2, api.col, 150, null, Math.PI, 0.18);
          g.sfx("shot"); if (i % 2) g.sfx("bulletHit");
          e.flash = 0.4; e.hitKick = 1; g.camera.kick(0.006);
        });
      }
      // «прицел»: тонкое кольцо сжимается на висящем враге
      api.once("lock", 0.66, () => { g.fx.ring(ecx, ecy, 30, 7, "#ffffff", api.life(0.2), 1.2); g.sfx("combo", 2); });
      // финал: с двух рук сходящимися росчерками (крест) — враг отлетает
      api.once("fin", SMG_FIN, () => {
        const h1 = CharacterRenderer.handWorld(p, 9), h2 = kdBackHand(p, 9);
        kdTracer(g, api, h1.x, h1.y, ecx + d * 14, ecy - 4, 1.8);
        kdTracer(g, api, h2.x, h2.y, ecx + d * 14, ecy + 4, 1.8);
        g.fx.sparks(ecx, ecy, 6, api.col, 230, d > 0 ? 0 : Math.PI, 1.2, 0.22);
        g.sfx("shot", true); g.sfx("bulletHit");
        e.x += d * 4;
        api.finish();
      });
    },
    pose(cs, p, td) {
      const t = td.t, e = td.e, ph = (a, b) => clamp((t - a) / (b - a), 0, 1);
      const ang = Math.atan2(e.y - e.h * e.scale * 0.5 - (p.y - 20), Math.abs(e.x - p.x)), aim = KD_HALF - ang;
      let kick = 0, odd = false;
      for (let i = 0; i < SMG_N; i++) { const s = t - (SMG_T0 + i * SMG_GAP); if (s >= 0 && s < 0.1) { kick = 1 - s / 0.1; odd = i % 2 === 1; } }
      const sf = t - SMG_FIN; if (sf >= 0 && sf < 0.22) kick = Math.max(kick, (1 - sf / 0.22) * 1.6);
      const ready = easeOut(ph(0, 0.1)), fin = t >= SMG_FIN - 0.1;
      const cross = fin ? 0 : odd ? -1 : 1;
      const P = {
        armF: lerp(0.4, aim + 0.14 * cross, ready) + (odd ? 0 : kick * 0.3), elbowF: 0,
        armB: lerp(-0.5, aim - 0.5 - 0.14 * cross, ready) + (odd ? kick * 0.3 : fin ? kick * 0.3 : 0),
        bodyY: 2 + Math.sin(t * 115) * 0.35 * (t < 0.6 ? 1 : 0) + kick * 0.6, legSpread: 1.85, lean: 0.06 - kick * 0.08, sx: 1 + 0.04 * cross, headTilt: -0.05, wBlend: 0,
      };
      if (t > 0.98) { const k = easeInOut(ph(0.98, 1.12)); P.armF = lerp(P.armF, 0.9, k); P.armB = lerp(P.armB, 0.2, k); P.bodyY = lerp(2, 0.6, k); P.legSpread = lerp(1.85, 1.2, k); }
      return P;
    },
  });

  /* =====================================================================
     РЕЛЬСОВЫЙ КАРАБИН
     ===================================================================== */
  const railPose = (P, act, p, k) => {
    const def = act.def;
    if (def.kind !== "ranged" && def.kind !== "custom") return;
    const ang = kdAim(act, p), aim = KD_HALF - ang, t = act.t;
    if (act.name === "railButt") { railButtPose(P, act, p, k, ang); return; }
    const b = kdBurst(act, 0.24);
    // приклад к плечу: плечо-локоть-кисть сложены, ствол задаётся углом оружия, задняя рука подпирает цевьё
    const sh = easeOut(clamp(t / Math.max(0.03, act.startup * 0.55), 0, 1));
    const charge = act.phase === "startup" ? k.s : 0;
    const hip = !!def.hip;
    const lean = (hip ? 0.18 : 0.12) - b.kick * 0.3;
    P.armF = lerp(0.4, aim - 0.7, sh); P.elbowF = lerp(0.15, 1.5, sh);
    P.armB = lerp(-0.4, aim - 0.38, sh);
    P.wBlend = sh; P.wAngle = lerp(0.6, ang - lean, sh);
    P.lean = lean;
    // низкая устойчивая стойка; дрожь растёт с зарядом, мощный откат всем телом
    P.legSpread = 1.95; P.sy = 1 - 0.05 * sh + b.kick * 0.03;
    P.bodyY = (hip ? 2.2 : 2.7) * sh + Math.sin(t * 140) * 0.28 * charge * charge + b.kick * 1.6;
    P.sx = 1 - b.kick * 0.07;
    P.headTilt = -0.08 - b.kick * 0.2;
    P.cloak = -b.kick * 1.1;
    // затвор: на восстановлении задняя рука дёргает его назад и возвращает
    if (act.phase === "recovery") {
      const u = clamp((k.r - 0.18) / 0.6, 0, 1), pump = Math.sin(Math.PI * u);
      P.armB -= 0.95 * pump; P.bodyY += 0.3 * pump; P.headTilt = -0.04;
      P.armF += 0.12 * pump;
    }
    // подсветка зарядки на карабине (метка времени — чтобы свечение гасло, когда приём прерван)
    p.kdCharge = act.phase === "startup" ? clamp(k.s * 1.15, 0, 1) : act.phase === "active" ? 1 : Math.max(0, 1 - k.r * 3);
    p.kdChargeAt = performance.now();
    if (def.backflip) P.wBlend = 0;
  };

  /** «Удар прикладом»: карабин взлетает, приклад с размаху вперёд, карабин прокручивается стволом вперёд — выстрел. */
  const railButtPose = (P, act, p, k, ang) => {
    const t = act.t, tA = act.startup;
    const lean0 = 0.1;
    let th, aF, aB, lean, sx = 1, bodyY;
    if (t < tA) {            // замах: карабин вскидывается, ствол вниз-назад, приклад вверх
      const u = easeOut(k.s);
      th = lerp(0.2, Math.PI * 0.55, u); aF = lerp(0.6, 2.3, u); aB = lerp(-0.3, 2.0, u); lean = lerp(0.05, -0.22, u); bodyY = 0.8 + 2.2 * u;
    } else if (t < tA + 0.1) {  // удар: приклад вперёд-вниз, корпус бросается за ним
      const u = easeOut((t - tA) / 0.1);
      th = lerp(Math.PI * 0.55, Math.PI, u); aF = lerp(2.3, 1.5, u); aB = lerp(2.0, 1.3, u); lean = lerp(-0.22, 0.5, u); sx = 1.1; bodyY = 2.6;
    } else {                    // проворот: карабин переворачивается стволом вперёд, выстрел навылет
      const u = easeInOut(clamp((t - tA - 0.1) / 0.11, 0, 1));
      th = lerp(Math.PI, TAU + ang - lean0, u); aF = lerp(1.5, KD_HALF - ang - 0.7, u); aB = lerp(1.3, KD_HALF - ang - 0.38, u); lean = lerp(0.5, lean0, u); bodyY = 2.6;
    }
    const sk = act.kdShot ? Math.max(0, 1 - (t - act.kdShotAt) / 0.22) : 0;
    P.armF = aF; P.elbowF = th > Math.PI * 1.2 ? 1.5 : 0.3; P.armB = aB; P.wBlend = 1; P.wAngle = th - lean * (th > Math.PI * 1.5 ? 1 : 0);
    P.lean = lean - sk * 0.28; P.legSpread = 1.95; P.bodyY = bodyY + sk * 1.4; P.sx = sx * (1 - sk * 0.06); P.sy = 0.95;
    P.cloak = -0.9 * (t >= tA ? 1 : 0);
    p.kdCharge = act.kdShot ? Math.max(0, 1 - sk) * 0.0 + sk : 0; p.kdChargeAt = performance.now();
  };

  /** Луч карабина: попадание по всем на линии. Возвращает конец луча. */
  const railBeamShoot = (cs, p, act, width, muzzle, dmgK) => {
    const g = cs.game, col = p.skin.accent, low = g.fx.low;
    const h = CharacterRenderer.handWorld(p, muzzle), tg = act.target;
    const ang = tg ? Math.atan2(tg.centerY - h.y, tg.x - h.x) : (act.dir > 0 ? 0 : Math.PI);
    const dx = Math.cos(ang), dy = Math.sin(ang), end = kdBeamEnd(h.x, h.y, dx, dy);
    const hits = [];
    for (const e of g.enemies) {
      if (!e.targetable) continue;
      const t = rayBox(h.x, h.y, dx, dy, { x: e.x - e.w * e.scale / 2 - 3, y: e.y - e.h * e.scale - 3, w: e.w * e.scale + 6, h: e.h * e.scale + 6 });
      if (t >= 0 && t <= end.t) hits.push({ e, t });
    }
    hits.sort((a, b) => a.t - b.t);
    // линия луча: широкое мягкое свечение, цветное тело, белая сердцевина
    g.fx.line(h.x, h.y, end.x, end.y, col, width * 2.6, 0.14);
    g.fx.line(h.x, h.y, end.x, end.y, col, width, 0.24);
    g.fx.line(h.x, h.y, end.x, end.y, "#ffffff", width * 0.34, 0.3);
    if (!low) g.fx.glow(h.x, h.y, 4, 28, "#ffffff", 0.18, 0.6);
    g.fx.ring(h.x, h.y, 3, 22, col, 0.22, 2);
    g.camera.shake(0.28); g.camera.kick(0.03);
    act.dmgK = dmgK || 1;
    for (const { e, t } of hits) {
      act.hit.add(e.id);
      cs._applyHit(e, act, sign(dx) || act.dir, h.x + dx * t, h.y + dy * t);
      g.fx.sparks(h.x + dx * t, h.y + dy * t, 5, col, 220, dx > 0 ? 0 : Math.PI, 1.0, 0.22);
    }
    act.dmgK = 1;
    return { h, end, hits: hits.length };
  };

  registerKit("rail", {
    pose: railPose,
    moves: {
      railBeam: {
        kind: "custom", startup: 0.16, active: 0.05, recovery: 0.3, cancel: 0.36, dmg: 22, knock: 260, stun: 0.4, moveControl: 0.1, name: "Заряженный луч",
        update(cs, p, act, dt) {
          const g = cs.game, def = act.def, col = p.skin.accent;
          if (!act.kdInit) { act.kdInit = true; cs.kdBeamT = cs.time; p.pistolT = 0.9; g.sfxAt(act.impactSong, "shot", true); g.sfx("combo", 1.5); }
          if (act.phase === "startup") {
            p.vx = damp(p.vx, 0, 14, dt);
            // зарядка: свет у дула сходится в точку
            if (!g.fx.low && Math.floor(act.t * 60) !== Math.floor((act.t - dt) * 60)) {
              const h = CharacterRenderer.handWorld(p, 20);
              g.fx.glow(h.x, h.y, 14 * (1 - act.t / act.startup) + 2, 4 + 14 * (act.t / act.startup), col, 0.06, 0.45);
            }
          }
          if (act.t >= act.startup && !act.kdFired) {
            act.kdFired = true;
            railBeamShoot(cs, p, act, 5, 20, 1);
            p.vx -= act.dir * 150;
            g.fx.dust(p.x - act.dir * 4, p.y, 4);
          }
        },
      },
      railButt: {
        kind: "custom", startup: 0.08, active: 0.2, recovery: 0.26, cancel: 0.32, dmg: 18, reach: 38, knock: 380, stun: 0.5, speed: 1900, pierce: true,
        pr: 5, life: 1.0, muzzle: 19, recoil: 70, moveControl: 0.1, name: "Удар прикладом",
        update(cs, p, act, dt) {
          const g = cs.game, def = act.def, col = p.skin.accent;
          if (!act.kdInit) { act.kdInit = true; cs.kdButtT = cs.time; p.pistolT = 0.9; g.sfxAt(act.impactSong, "slash", 1.3); }
          if (act.phase === "startup") p.vx = damp(p.vx, 0, 14, dt);
          // удар прикладом: ближний хит в начале активной фазы, отбрасывает врага
          if (act.t >= act.startup && !act.kdButt) {
            act.kdButt = true; act.dmgK = 0.45; p.vx = act.dir * 70;
            cs._meleeHits(p, act, false);
            const cx = p.x + act.dir * 20, cy = p.y - 18;
            g.fx.cut(cx - act.dir * 10, cy - 12, cx + act.dir * 14, cy + 6, "#ffffff", 2.4, 0.2);
            g.fx.sparks(cx + act.dir * 8, cy, 4, col, 200, act.dir > 0 ? 0 : Math.PI, 1, 0.2);
            g.camera.shake(0.12);
          }
          // выстрел навылет после проворота карабина
          if (act.t >= act.startup + 0.11 && !act.kdShot) {
            act.kdShot = true; act.kdShotAt = act.t; act.dmgK = 1;
            cs._fire(p, act, 0);
            g.fx.line(p.x, p.y - 18, p.x + act.dir * 260, p.y - 18, col, 6, 0.1);
          }
        },
      },
    },
    choose(cs, name, c) {
      if (c.air || !c.target) return;
      // враг вплотную при отходе (обычно «Отскок-выстрел») + точно → приклад
      if (c.good && c.dx <= 60 && Math.abs(c.dy) < 50 && kdSince(cs, "kdButtT") > 0.8) return "railButt";
      // третий выстрел подряд в такт → луч
      if (c.good && cs.shotChain >= 2 && name !== "backShot" && kdSince(cs, "kdBeamT") > 2.4) return "railBeam";
    },
    takedown(cs, kind, e, act) { return kind === "colossus" ? null : "railPierce"; },
  });

  const RAIL_FIRE = 0.52;
  registerTakedown("railPierce", {
    name: "ЛУЧ НАВЫЛЕТ", dur: 1.2, death: "shot",
    update(cs, td, api) {
      const g = cs.game, p = g.player, e = td.e, t = api.t, d = td.dir, col = api.col;
      p.pistolT = 0.9; p.y = td.py; p.facing = d;
      // отдача: герой проезжает назад, пока не выстрелил — стоит на месте
      p.x = t < RAIL_FIRE ? td.px : td.px - d * 14 * easeOut((t - RAIL_FIRE) / 0.2);
      if (td.z0 === undefined) td.z0 = g.camera.fz;
      const ecy = e.y - e.h * e.scale * 0.5;
      g.camera.retarget(lerp(p.x, e.x, 0.55), ecy - 6, Math.min(1.6, td.z0 * (1 + 0.14 * easeInOut(clamp(t / RAIL_FIRE, 0, 1)))));
      if (t < RAIL_FIRE) {
        // враг оглушён и «примёрз» под прицелом; тонкая линия лазерного целеуказателя тянется к груди
        e.tdPose = { lean: -0.12, armF: -0.8, armB: -1.1, bodyY: 1.5, headTilt: -0.15 };
        const h = CharacterRenderer.handWorld(p, 20);
        if (t > 0.1) {
          const a = 0.3 + 0.7 * clamp((t - 0.1) / 0.4, 0, 1);
          g.fx.line(h.x, h.y, e.x, ecy, col, 0.9 * a, api.life(0.05));
        }
        if (!api.low && Math.floor(t * 40) !== Math.floor((t - api.dt) * 40) && t > 0.1) {
          const u = clamp((t - 0.1) / 0.4, 0, 1);
          g.fx.glow(h.x, h.y, 14 * (1 - u) + 3, 5 + 14 * u, col, api.life(0.07), 0.45);
        }
      }
      api.once("fire", RAIL_FIRE, () => {
        const h = CharacterRenderer.handWorld(p, 20);
        const dx = e.x - h.x, dy = ecy - h.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, end = kdBeamEnd(h.x, h.y, ux, uy);
        g.fx.line(h.x, h.y, end.x, end.y, col, 16, api.life(0.2));
        g.fx.line(h.x, h.y, end.x, end.y, col, 6, api.life(0.34));
        g.fx.line(h.x, h.y, end.x, end.y, "#ffffff", 2, api.life(0.4));
        if (!api.low) g.fx.glow(h.x, h.y, 6, 34, "#ffffff", api.life(0.2), 0.6);
        g.fx.ring(h.x, h.y, 3, 26, col, api.life(0.3), 2);
        g.fx.ring(e.x, ecy, 4, 40, "#ffffff", api.life(0.3), 1.6);
        g.fx.dust(p.x - d * 4, p.y, api.low ? 3 : 6);
        g.sfx("shot", true); g.sfx("bulletHit"); g.sfx("slam");
        g.camera.shake(0.3); g.camera.kick(0.04);
        e.flash = 0.6; e.hitKick = 1;
        api.finish();
      });
      // луч остывает: тонкий след остаётся на экране, дымок у дула
      api.once("after", RAIL_FIRE + 0.12, () => {
        const h = CharacterRenderer.handWorld(p, 20), end = kdBeamEnd(h.x, h.y, d, 0);
        g.fx.line(h.x, h.y, end.x, h.y, col, 1.2, api.life(0.4));
        if (!api.low) g.fx.glow(h.x, h.y, 3, 12, "#8892a6", api.life(0.4), 0.25);
      });
      if (t > RAIL_FIRE + 0.5) p.kdCharge = 0;
    },
    pose(cs, p, td) {
      const t = td.t, e = td.e, ph = (a, b) => clamp((t - a) / (b - a), 0, 1);
      const ang = Math.atan2(e.y - e.h * e.scale * 0.5 - (p.y - 20), Math.abs(e.x - p.x)), aim = KD_HALF - ang;
      const sh = easeOut(ph(0, 0.12)), kick = t >= RAIL_FIRE ? Math.max(0, 1 - (t - RAIL_FIRE) / 0.3) : 0;
      const charge = clamp(ph(0.1, RAIL_FIRE), 0, 1);
      const lean = 0.12 - kick * 0.34;
      const P = {
        armF: lerp(0.4, aim - 0.7, sh), elbowF: lerp(0.15, 1.5, sh), armB: lerp(-0.4, aim - 0.38, sh), wBlend: sh, wAngle: lerp(0.6, ang - lean, sh),
        lean, legSpread: 1.95, sy: 0.95 + kick * 0.03, bodyY: 2.7 * sh + Math.sin(t * 140) * 0.3 * charge * charge * (t < RAIL_FIRE ? 1 : 0) + kick * 1.8, sx: 1 - kick * 0.08,
        headTilt: -0.08 - kick * 0.2, cloak: -kick * 1.2,
      };
      if (t >= RAIL_FIRE + 0.12) {     // затвор: рука дёргает назад и возвращает
        const u = ph(RAIL_FIRE + 0.14, RAIL_FIRE + 0.5), pump = Math.sin(Math.PI * u);
        P.armB -= 0.95 * pump; P.armF += 0.12 * pump; P.headTilt = -0.04;
      }
      if (t > 1.0) { const k = easeInOut(ph(1.0, 1.2)); P.armF = lerp(P.armF, 0.9, k); P.elbowF = lerp(P.elbowF, 0.3, k); P.wBlend = lerp(P.wBlend, 0, k); P.armB = lerp(P.armB, 0.2, k); P.bodyY = lerp(P.bodyY, 0.6, k); P.legSpread = lerp(1.95, 1.2, k); }
      p.kdCharge = t < RAIL_FIRE ? charge : Math.max(0, 1 - (t - RAIL_FIRE) / 0.4); p.kdChargeAt = performance.now();
      return P;
    },
  });

  /* =====================================================================
     НЕОНОВЫЙ ПИСТОЛЕТ
     ===================================================================== */
  const pistolPose = (P, act, p, k) => {
    const def = act.def;
    if (def.kind !== "ranged" && def.kind !== "custom") return;
    const ang = kdAim(act, p), aim = KD_HALF - ang, t = act.t;
    const b = kdBurst(act, 0.1);
    const ready = easeOut(clamp(t / Math.max(0.025, act.startup), 0, 1));
    // стойка с хватом двумя руками: задняя кисть подхватывает рукоять, чуть присед, щека к плечу
    let aF = lerp(0.35, aim, ready) + b.kick * 0.28, aB = lerp(-0.45, aim - 0.22, ready) + b.kick * 0.22;
    P.elbowF = 0; P.armF = aF; P.armB = aB;
    P.lean = 0.07 - b.kick * 0.09; P.bodyY = 1.7 + b.kick * 0.9; P.legSpread = 1.65; P.sx = 1.03 - b.kick * 0.03; P.headTilt = -0.07; P.wBlend = 0;
    if (def.hip) {          // от бедра: одна рука, корпус вперёд, вторая — противовесом
      P.armF = lerp(0.2, aim + 0.25, ready) + b.kick * 0.3; P.armB = -0.7; P.lean = 0.18; P.bodyY = 2; P.legSpread = 1.55; P.headTilt = 0.1;
    }
    if (act.name === "pistolBlind") {
      // выстрел через плечо: рука назад, свободная — вперёд для равновесия, взгляд на врага
      const back = ang - KD_HALF;
      P.armF = lerp(0.35, back, ready) + b.kick * 0.25; P.armB = lerp(-0.45, 1.25, ready);
      P.lean = 0.3 - b.kick * 0.1; P.bodyY = 1.4; P.headTilt = -0.3; P.legSpread = 1.7; P.cloak = 0.8; P.sx = 1;
    }
    // трюковая прокрутка на восстановлении: заряженный, «Дабл-тап», точные выстрелы на отдельных долях
    const bt = act.judge && act.judge.beatTime ? Math.floor(act.judge.beatTime * 1000) : 0;
    const twirl = act.phase === "recovery" && act.name !== "pistolBlind" && (act.name === "charged" || act.name === "pistolDtap" || (act.judge && act.judge.rating === "perfect" && bt % 3 === 0));
    if (twirl) {
      const tw = clamp((k.r - 0.08) / 0.7, 0, 1), e = easeInOut(tw);
      P.wBlend = 1; P.wAngle = KD_HALF - (aF + 0) + TAU * e;
      P.armF = lerp(aF, 1.05, easeOut(tw) * 0.6); P.elbowF = 0.5 * e; P.armB = lerp(aB, -0.3, e); P.headTilt = -0.1 * e; P.bodyY = lerp(P.bodyY, 0.8, e);
    }
  };

  registerKit("pistol", {
    pose: pistolPose,
    moves: {
      pistolDtap: {
        kind: "ranged", startup: 0.04, active: 0.29, recovery: 0.17, cancel: 0.34, dmg: 10, speed: 1100, knock: 120, stun: 0.2,
        shots: 2, gap: 0.26, pr: 3.6, muzzle: 8, name: "Дабл-тап",
        update(cs, p, act) {
          const g = cs.game, def = act.def;
          if (!act.kdInit) { act.kdInit = true; p.pistolT = 0.9; if (act.judge) g.sfxAt(act.impactSong + def.gap, "beatHit", 0.9); }
          // вторая пуля — в ту же точку, куда пришла первая
          if ((act.shotsFired || 0) === 1 && act.target && !act.kdPt) {
            act.kdPt = true;
            g.fx.ring(act.target.x, act.target.centerY, 3, 14, "#ffffff", 0.3, 1.4);
          }
        },
      },
      pistolBlind: {
        kind: "ranged", startup: 0.05, active: 0.04, recovery: 0.2, cancel: 0.16, dmg: 12, speed: 1050, knock: 170, stun: 0.25, pr: 3.5, muzzle: 8,
        moveControl: 0.55, recoil: 35, name: "Вслепую",
        update(cs, p, act) {
          if (!act.kdInit) { act.kdInit = true; p.pistolT = 0.9; p.facing = -act.dir; }          // стреляет через плечо, не разворачиваясь
          if (act.phase === "recovery" && !act.kdTurn) { act.kdTurn = true; p.facing = act.dir; }  // после выстрела разворот к врагу
        },
      },
    },
    choose(cs, name, c) {
      const p = c.p, t = c.target;
      if (c.air || !t) return;
      const behind = sign(t.x - p.x) !== p.facing && c.dx > 34;
      // «и» сразу после выстрела в долю: пуля на полдоли, вторая — на следующей доле
      if (c.j.offbeat && cs.lastAction && ATTACKS[cs.lastAction].kind === "ranged" && cs.time - cs.lastActionT < 0.6 && !behind) {
        const d = ATTACKS.pistolDtap;
        d.gap = clamp(c.j.period, 0.12, 0.38); d.active = d.gap + 0.03; d.cancel = d.startup + d.gap + 0.05;
        return "pistolDtap";
      }
      // враг за спиной и нажатие точное: выстрел через плечо (отход вплотную остаётся «Отскок-выстрелом»)
      if (c.good && behind && name !== "backShot" && Math.abs(c.dy) < 160) return "pistolBlind";
    },
    takedown(cs, kind, e, act) { return kind === "colossus" ? null : "pistolTrio"; },
  });

  // три выстрела с трёх позиций: с земли у врага, сверху в прыжке над ним, с земли с другой стороны — затем прокрутка пистолета
  const PT = { s1: 0.12, s2: 0.29, s3: 0.46 };
  const ptPos = (td, which) => clamp(td.ex + (which === "A" ? -td.dir * 68 : td.dir * 62), 40, WORLD.w - 40);
  registerTakedown("pistolTrio", {
    name: "ТРИ ТОЧКИ", dur: 1.0, death: "shot",
    update(cs, td, api) {
      const g = cs.game, p = g.player, e = td.e, t = api.t, d = td.dir, col = api.col;
      const A = ptPos(td, "A"), B = ptPos(td, "B"), gnd = td.py;
      p.pistolT = 0.9;
      if (t < 0.08) { p.x = lerp(td.px, A, easeInOut(t / 0.08)); p.y = gnd; p.facing = d; }
      else if (t < 0.2) { p.x = A; p.y = gnd; p.facing = d; }
      else if (t < 0.38) {          // прыжок через врага
        const k = (t - 0.2) / 0.18;
        p.x = lerp(A, B, easeInOut(k)); p.y = gnd - 44 * Math.sin(Math.PI * k); p.facing = k > 0.55 ? -d : d;
      } else { p.x = B; p.y = lerp(p.y, gnd, 0.5); p.facing = -d; }
      if (t >= 0.46) p.y = gnd;
      const ecx = e.x, ecy = e.y - e.h * e.scale * 0.5;
      g.camera.retarget(lerp(p.x, e.x, 0.45), ecy - 8);
      if (t < PT.s3) e.tdPose = { lean: -0.15, armF: -0.9, armB: -1.2, bodyY: 1.5, headTilt: -0.2 };
      const fire = big => {
        const h = CharacterRenderer.handWorld(p, 8);
        kdTracer(g, api, h.x, h.y, ecx, ecy, big ? 2 : 1.2);
        g.fx.sparks(ecx, ecy, big ? 6 : 3, col, 200, sign(ecx - h.x) > 0 ? 0 : Math.PI, 1.1, 0.22);
        g.sfx("shot", big); g.sfx("bulletHit");
        e.flash = 0.5; e.hitKick = 1; g.camera.shake(big ? 0.2 : 0.08); g.camera.kick(big ? 0.02 : 0.008);
      };
      api.once("d1", 0.0, () => api.streak(td.px, A));
      api.once("s1", PT.s1, () => fire(false));
      api.once("hop", 0.2, () => { g.fx.cut(A, gnd - 6, B, gnd - 6, col, 1.6, api.life(0.25)); g.sfx("dash"); });
      api.once("s2", PT.s2, () => fire(false));
      api.once("s3", PT.s3, () => { fire(true); e.x += d * 3; api.finish(); });
    },
    pose(cs, p, td) {
      const t = td.t, e = td.e, ph = (a, b) => clamp((t - a) / (b - a), 0, 1);
      const ang = Math.atan2(e.y - e.h * e.scale * 0.5 - (p.y - 20), Math.abs(e.x - p.x)), aim = KD_HALF - ang;
      let kick = 0;
      for (const s0 of [PT.s1, PT.s2, PT.s3]) { const s = t - s0; if (s >= 0 && s < 0.12) kick = Math.max(kick, (1 - s / 0.12) * (s0 === PT.s3 ? 1.5 : 1)); }
      const air = t >= 0.2 && t < 0.4;
      const P = {
        armF: aim + kick * 0.28, elbowF: 0, armB: aim - 0.22 + kick * 0.22, bodyY: 1.8 + kick, legSpread: 1.7, lean: 0.07 - kick * 0.09, sx: 1.03, headTilt: -0.07, wBlend: 0,
        tuck: air ? 0.7 : 0, spin: 0,
      };
      if (air) { P.legSpread = 1.2; P.sy = 1.06; P.sx = 0.94; P.bodyY = 0; }
      if (t > 0.54) {      // прокрутка пистолета и возврат в кобуру
        const u = ph(0.54, 0.86), e2 = easeInOut(u);
        P.wBlend = 1; P.wAngle = KD_HALF - aim + TAU * e2;
        P.armF = lerp(aim, 1.05, easeOut(u) * 0.7); P.elbowF = 0.5 * e2; P.armB = lerp(aim - 0.22, -0.3, e2); P.bodyY = lerp(1.8, 0.4, u); P.legSpread = lerp(1.7, 1.2, u); P.headTilt = -0.1 * e2; P.lean = lerp(0.04, -0.03, u);
      }
      return P;
    },
  });
}
