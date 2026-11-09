/* =====================================================================
   Оружие ближнего боя, часть 2 (12d_kits): nunchaku «Громовые нунчаки», claws «Волчьи когти», twinsteel «Двойная сталь»
   (катана в передней руке + кинжал обратным хватом во второй), tessen «Стальной веер».
   Как у остальных видов оружия, у каждого свои:
     • позы ВСЕХ атак (kit.pose) — обе руки работают;
     • отрисовка в руке (WEAPON_DRAW[id]) — силуэт в стиле игры: тёмная заливка + неоновая кромка; вторая рука рисуется так же,
       как второй автомат у «Парных автоматов»: положение задней кисти считает backHand() по позе (armB), без аллокаций в кадре;
     • комбинации (kit.moves + kit.choose), условие — в ритме (сильная доля, точность, грув, враги с двух сторон…);
     • добивание (registerTakedown) вместо «Рассечения» на земле (в воздухе и громила — встроенные sky/colossus);
     • 3 трюка в покое (registerTricks, 12e_tricks).
   Параметры второй руки и подвижных частей оружия лежат на герое (p.nu*, p.cl*, p.ts*, p.te*) и считаются позами; все они
   «свежие» только пока поза их выставляет (метка p.m2At), иначе плавно (m2Fade) гаснут к виду «в покое».
     НУНЧАКИ — палка A в руке, цепь и палка B двухзвенный маятник с пружинами (по гравитации в осях героя либо по цели позы):
       p.nuD — вес позы (0 — висят по гравитации, 1 — следуют углу p.nuT от оси палки A), p.nuB — излом палки B относительно цепи,
       p.nuG — палка B в задней руке (хват двумя руками, угол p.nuGA относительно предплечья), p.nuE — разряд на концах.
       Комбинации: Восьмёрка (nuEight) — сильная доля + точно вплотную: три круговых удара, цепь чертит восьмёрку;
                   Хлёст (nuLash) — вместо рывка (точное нажатие, цель дальше вплотную): шаг и удар вытянутой цепью;
                   Перехват (nuCatch) — враги с двух сторон + точно: палка выстреливает вперёд, потом из-под мышки назад.
       Добивание: «ГРОМОВАЯ ДРОБЬ».
     ВОЛЧЬИ КОГТИ — по три лезвия на обеих руках (задняя рисуется на кисти задней руки), p.clFl — растопыренность лезвий.
       Комбинации: Разрыв (clRend) — сильная доля + точно вплотную: когти крест-накрест вверх;
                   Бешенство (clFrenzy) — то же при груве ≥ 2: шесть быстрых ударов обеими руками по очереди;
                   Прыжок волка (clPounce) — вместо рывка: бросок на цель с обеими лапами.
       Добивание: «ЧЕТЫРЕ БОРОЗДЫ».
     ДВОЙНАЯ СТАЛЬ — катана (как у «Багровой катаны») + кинжал обратным хватом, p.tsB — поворот кинжала вокруг кисти.
       Комбинации: Ножницы (tsScissors) — сильная доля + точно вплотную: катана рубит вниз, кинжал снизу вверх крест-накрест;
                   Выпад с перехватом (tsLunge) — вместо рывка: проход катаной и обратный удар кинжалом по пути назад.
       Добивание: «СКРЕЩЁННАЯ СТАЛЬ».
     СТАЛЬНОЙ ВЕЕР (тэссэн) — p.teO — раскрытие 0..1 (сложен — стержень), бросок: p.teFly/p.teX/p.teY/p.teR (положение веера в осях героя).
       Комбинации: Порыв (teGust) — сильная доля + точно вплотную: веер раскрывается и рубит вверх, ветер отбрасывает всех рядом;
                   Бросок веера (teThrow) — вместо рывка: веер летит по дуге к цели, режет, возвращается в руку.
       Добивание: «ТАНЕЦ ВЕЕРА».
   Всё в блоке {} — имена локальны.
   ===================================================================== */
{
  const PI = Math.PI;
  const wrapPi = a => a - TAU * Math.round(a / TAU);
  const period = cs => { const c = cs.game.clock; return c.map ? c.period : 0.5; };
  /** Опорный угол оружия на весь приём: ближайшее к текущему представление угла w0. */
  const baseAng = (act, p, w0, key = "kb") => {
    if (act[key] == null) { const cur = p.anim ? p.anim.pose.wAngle || 0 : 0; act[key] = cur + wrapPi(w0 - cur); }
    return act[key];
  };
  /** Имя базового приёма для таблиц поз (воздушные и сквозные — как земные). */
  const BASE = { airSlash: "slash1", dash: "thrust", pierce: "thrust", flurry: "thrust", riposte: "slash3" };
  const SKIP = { dive: 1, meteor: 1, airSpin: 1 };
  const subOf = (act, k) => { const h = act.def.hits || 1, s = Math.min(h - 1, Math.floor(k.a * h)); return { h, s, u: k.a * h - s }; };
  const ground = p => p.onGround !== false;
  const ready = (cs, key, cd) => { const m = cs._kitT || (cs._kitT = {}), t = m[key]; return t == null || t > cs.time || cs.time - t > cd; };
  const mark = (cs, key) => { (cs._kitT || (cs._kitT = {}))[key] = cs.time; };
  const around = (cs, r) => {
    const g = cs.game, p = g.player; let l = 0, rt = 0;
    for (const e of g.enemies) {
      if (!e.targetable || Math.abs(e.y - p.y) > 40) continue;
      const dx = e.x - p.x;
      if (Math.abs(dx) - e.w * e.scale / 2 <= r) { if (dx < 0) l++; else rt++; }
    }
    return { l, r: rt, n: l + rt };
  };
  const nearestEnemy = (g, p, maxDx) => {
    let best = null, bd = maxDx;
    for (const e of g.enemies) { if (!e.targetable) continue; const d = Math.abs(e.x - p.x); if (d < bd) { bd = d; best = e; } }
    return best;
  };
  /** Попадание по прямоугольнику (для приёмов с собственной зоной). */
  const hitBox = (cs, p, act, box, dirSign) => {
    let n = 0;
    for (const e of cs.game.enemies) {
      if (!e.targetable || act.hit.has(e.id)) continue;
      const eb = { x: e.x - e.w * e.scale / 2, y: e.y - e.h * e.scale, w: e.w * e.scale, h: e.h * e.scale };
      if (!rectsOverlap(box, eb)) continue;
      act.hit.add(e.id); n++;
      cs._applyHit(e, act, dirSign || sign(e.x - p.x) || act.dir, e.x, e.centerY);
    }
    return n;
  };
  /** Попадание по кругу вокруг точки (метательный веер): каждого врага один раз за вылет. */
  const hitCircle = (cs, p, act, x, y, r) => {
    let n = 0;
    for (const e of cs.game.enemies) {
      if (!e.targetable || act.hit.has(e.id)) continue;
      const w = e.w * e.scale / 2 + r;
      if (Math.abs(e.x - x) > w || y < e.y - e.h * e.scale - r || y > e.y + r) continue;
      act.hit.add(e.id); n++;
      cs._applyHit(e, act, sign(e.x - p.x) || act.dir, e.x, e.centerY);
    }
    return n;
  };

  /* ---------- свежесть параметров, заданных позой ---------- */
  const stamp = ch => { ch.m2At = performance.now(); };
  /** Вес параметров позы 0..1: гаснет, когда поза перестала их выставлять (метка свежести 160 мс), и растёт обратно. */
  const m2Fade = ch => {
    const now = performance.now(), dt = clamp((now - (ch.m2T || now)) / 1000, 0, 0.05);
    ch.m2T = now;
    const on = now - (ch.m2At || 0) < 160 ? 1 : 0;
    ch.m2K = ch.m2K == null ? on : ch.m2K + (on - ch.m2K) * (1 - Math.exp(-dt * 14));
    return ch.m2K;
  };

  /* ---------- задняя рука ---------- */
  const BH = { x: 0, y: 0, a: 0 };
  /** Кисть задней руки и направление её предплечья в осях оружия передней руки (как второй автомат в 12k_d_guns).
   *  off — поворот хвата передней руки в покое (WEAPON_DRAW[id].off). Возвращает общий объект BH (x, y, a). */
  const backHand = (p, off) => {
    const hipY = -9 + p.bodyY, fa = p.armF, fe = p.elbowF;
    const fx = 1 + Math.sin(fa) * 6 + Math.sin(fa + fe) * 6, fy = hipY - 9 + Math.cos(fa) * 6 + Math.cos(fa + fe) * 6;
    const bx = 1 + Math.sin(p.armB) * 6 + Math.sin(p.armB + 0.5) * 6, by = hipY - 9 + Math.cos(p.armB) * 6 + Math.cos(p.armB + 0.5) * 6;
    let dx = Math.sin(fa + fe), dy = Math.cos(fa + fe);
    if (p.wBlend > 0) { dx = lerp(dx, Math.cos(p.wAngle), p.wBlend); dy = lerp(dy, Math.sin(p.wAngle), p.wBlend); }
    const th = Math.atan2(dy, dx) + off * (1 - p.wBlend), c = Math.cos(th), s = Math.sin(th), rx = bx - fx, ry = by - fy;
    BH.x = rx * c + ry * s; BH.y = -rx * s + ry * c; BH.a = PI / 2 - (p.armB + 0.5) - th;
    return BH;
  };

  /** Определения оружия. mod — множители (12b_weapons.buildWeaponDef); приёмы набора их не проходят. */
  WEAPONS.nunchaku = {
    slot: "melee", name: "Громовые нунчаки", info: "Две палки на цепи: самые быстрые серии, но короткая дальность.", stats: [2, 5, 3], rangeK: 0.94,
    mod: { reach: 0.9, st: 0.74, rc: 0.76, dmg: 0.97, knock: 0.7, stun: 0.85, lunge: 0.95, fxR: 0.95, fxW: 0.8 },
  };
  WEAPONS.claws = {
    slot: "melee", name: "Волчьи когти", info: "Когти на обеих руках: молниеносные удары и броски на врага.", stats: [1, 5, 3], rangeK: 0.86,
    mod: { reach: 0.86, st: 0.7, rc: 0.72, ac: 0.9, dmg: 0.96, knock: 0.55, stun: 0.8, lunge: 1.35, fxR: 0.85, fxW: 0.7 },
  };
  WEAPONS.twinsteel = {
    slot: "melee", name: "Двойная сталь", info: "Катана и кинжал: дальний разрез и быстрый удар второй рукой.", stats: [3, 4, 3], rangeK: 1.06,
    mod: { reach: 1.05, st: 0.88, rc: 0.9, dmg: 0.93, knock: 0.85, stun: 0.9, lunge: 1.05, fxR: 1.1, fxW: 0.7 },
  };
  WEAPONS.tessen = {
    slot: "melee", name: "Стальной веер", info: "Режущие махи широкой дугой, ветер отбрасывает врагов; бросок с возвратом.", stats: [3, 4, 3], rangeK: 1.04,
    mod: { reach: 1.05, st: 0.88, rc: 0.9, dmg: 0.95, knock: 1.25, stun: 0.9, lunge: 0.95, fxR: 1.3, fxW: 1.15 },
  };
  for (const id of ["nunchaku", "claws", "twinsteel", "tessen"]) { WEAPONS[id].id = id; WEAPONS[id]._defs = {}; }
  // ---- общая часть поз ----
  /** Фаза «подготовка → удар → доводка» по таблице S: рука/локоть/угол оружия; возвращает [w, arm, elb, q] (q — ход удара 0..1). */
  const swing = (S, act, k, h, s, u, rest) => {
    const ph = act.phase;
    let w = S.w0, arm = S.a0, elb = S.e0, q = 0;
    if (ph === "startup" || ph === "travel") {
      const e = easeOut(ph === "travel" ? 1 : k.s);
      w = lerp(rest, S.w0, e); arm = lerp(0.6, S.a0, e); elb = lerp(0.6, S.e0, e);
    } else if (ph === "active") {
      q = S.spin ? easeInOut(k.a) : easeOut(k.a);
      let a0 = S.w0, a1 = S.w1, r0 = S.a0, r1 = S.a1, f0 = S.e0, f1 = S.e1;
      if (h > 1 && !S.spin && !S.jab) { q = easeOut(u); if (s % 2) { a0 = S.w1; a1 = S.w0; r0 = S.a1; r1 = S.a0; f0 = S.e1; f1 = S.e0; } }
      w = lerp(a0, a1, q); arm = lerp(r0, r1, q); elb = lerp(f0, f1, q);
      if (S.jab && h > 1) { arm = lerp(0.9, 1.57, easeOut(Math.min(1, u * 1.4))); w = lerp(s % 2 ? 0.4 : S.w0, S.w1, easeOut(Math.min(1, u * 1.4))); elb = 0.05; }
    } else {
      const e = easeInOut(k.r), w1 = S.w1;
      w = lerp(w1, w1 + wrapPi(rest - w1), e); arm = lerp(S.a1, 0.6, e); elb = lerp(S.e1, 0.6, e);
    }
    return [w, arm, elb, q];
  };

  /* =====================================================================
     НУНЧАКИ
     ===================================================================== */
  const NU_REST = -1.25;                 // угол палки A в стойке (у WEAPON_DRAW.off = −1.9 при wBlend 0)
  const nuA = (kb, w) => kb + (w - NU_REST);      // абсолютный угол палки w → числовая ветка опорного угла приёма kb
  const NU_A0 = -3.2, NU_A1 = 6.4, NU_LC = 4.4, NU_LB = 9.4;
  const NU_BANDS = [0.18, 0.32, 0.46, 0.82];
  /** Палка: усечённый брусок с обмоткой, колпачками и бликом (из точки (x0,y0) в (x1,y1)). */
  const m2Stick = (ctx, x0, y0, x1, y1, w, accent, hq) => {
    const l = Math.hypot(x1 - x0, y1 - y0) || 1;
    ctx.save(); ctx.translate(x0, y0); ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
    ctx.fillStyle = "#17181f";
    ctx.beginPath(); ctx.moveTo(0, -w * 0.5); ctx.lineTo(l, -w * 0.42); ctx.lineTo(l, w * 0.42); ctx.lineTo(0, w * 0.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgba(accent, 0.75);
    for (const f of NU_BANDS) ctx.fillRect(l * f - 0.25, -w * 0.5, 0.5, w);
    ctx.fillStyle = accent; ctx.fillRect(-0.2, -w * 0.58, 0.9, w * 1.16); ctx.fillRect(l - 0.7, -w * 0.5, 0.9, w);
    ctx.fillStyle = rgba("#ffffff", 0.15); ctx.fillRect(1.5, -w * 0.3, l - 3, 0.35);
    if (hq) { ctx.globalAlpha *= 0.28; ctx.strokeStyle = accent; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(0, -w * 0.45); ctx.lineTo(l, -w * 0.4); ctx.stroke(); ctx.globalAlpha /= 0.28; }
    ctx.restore();
  };
  /** Цепь: дуга с провисом в сторону земли (gx, gy — направление «вниз» в осях оружия), звенья — чередующиеся овалы. */
  const m2Chain = (ctx, x0, y0, x1, y1, sag, gx, gy) => {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len, ny = dx / len;
    if (nx * gx + ny * gy < 0) { nx = -nx; ny = -ny; }
    const cx = (x0 + x1) / 2 + nx * sag * 2, cy = (y0 + y1) / 2 + ny * sag * 2;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1);
    ctx.strokeStyle = "#5d6274"; ctx.lineWidth = 0.4; ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const t = (i + 0.5) / 4, u = 1 - t;
      const px = u * u * x0 + 2 * u * t * cx + t * t * x1, py = u * u * y0 + 2 * u * t * cy + t * t * y1;
      const ang = Math.atan2(2 * u * (cy - y0) + 2 * t * (y1 - cy), 2 * u * (cx - x0) + 2 * t * (x1 - cx)), rx = i % 2 ? 0.8 : 1.3;
      ctx.moveTo(px + Math.cos(ang) * rx, py + Math.sin(ang) * rx);
      ctx.ellipse(px, py, rx, i % 2 ? 0.4 : 0.75, ang, 0, TAU);
    }
    ctx.strokeStyle = "#a3a9bc"; ctx.lineWidth = 0.55; ctx.stroke();
  };
  WEAPON_DRAW.nunchaku = {
    off: -1.9,
    preview(P, ch, act) {
      stamp(ch);
      if (act === "strike") { Object.assign(P, { armF: 1.75, elbowF: 0.1, lean: 0.3, legSpread: 1.7, wBlend: 1, wAngle: -0.3, armB: -0.9 }); ch.nuD = 1; ch.nuT = 0.15; ch.nuE = 1; }
      else { Object.assign(P, { armF: 0.9, elbowF: 0.5, lean: 0.05, armB: 1.0 }); ch.nuD = 1; ch.nuT = 1.1; ch.nuG = 0; }
    },
    draw(ctx, ch, p, accent, hq) {
      const K = m2Fade(ch);
      // направление «вниз» (гравитация) в осях палки A: цепь и вторая палка висят по нему, пока поза не задаёт свой угол
      const m = ctx.getTransform(), al = Math.atan2(m.b, (ch.facing || 1) * m.a), grav = PI / 2 - al;
      const D = (ch.nuD || 0) * K, tg = grav + wrapPi((ch.nuT || 0) - grav) * D;
      let S = ch.nuS; const now = performance.now();
      if (!S) S = ch.nuS = { a1: tg, v1: 0, a2: tg, v2: 0, t: now };
      // двухзвенный маятник с пружинами: цепь тянется к цели, вторая палка — за цепью (хлёст получается сам)
      const dt = clamp((now - S.t) / 1000, 0, 0.05); S.t = now;
      const n = Math.ceil(dt * 120), hh = n ? dt / n : 0, bendT = (ch.nuB || 0) * K;
      for (let i = 0; i < n; i++) {
        S.v1 += (260 * wrapPi(tg - S.a1) - 17 * S.v1) * hh; S.a1 += S.v1 * hh;
        S.v2 += (170 * wrapPi(S.a1 + bendT - S.a2) - 9 * S.v2) * hh; S.a2 += S.v2 * hh;
      }
      const sh = TAU * Math.round(S.a1 / TAU); S.a1 -= sh; S.a2 -= sh;
      const G = (ch.nuG || 0) * K;
      let jx = NU_A1 + Math.cos(S.a1) * NU_LC, jy = Math.sin(S.a1) * NU_LC, a2 = S.a2, sag = 0.5 + Math.min(1.6, Math.abs(S.v1) * 0.07);
      if (G > 0.01 && p.armB != null) {
        // палка B в задней руке: хват посередине, цепь провисает между руками
        const bh = backHand(p, WEAPON_DRAW.nunchaku.off), tb = bh.a + (ch.nuGA || 0);
        jx = lerp(jx, bh.x - Math.cos(tb) * NU_LB * 0.4, G); jy = lerp(jy, bh.y - Math.sin(tb) * NU_LB * 0.4, G);
        a2 += wrapPi(tb - a2) * G;
        sag = lerp(sag, clamp((NU_LC * 1.2 - Math.hypot(jx - NU_A1, jy)) * 0.7, 0.4, 3.2), G);
      }
      m2Chain(ctx, NU_A1, 0, jx, jy, sag, Math.cos(grav), Math.sin(grav));
      const tx = jx + Math.cos(a2) * NU_LB, ty = jy + Math.sin(a2) * NU_LB;
      m2Stick(ctx, jx, jy, tx, ty, 1.7, accent, hq);
      m2Stick(ctx, NU_A0, 0, NU_A1, 0, 1.7, accent, hq);
      // разряд на концах (громовые): короткие ломаные, перерисовываются каждые ~35 мс
      const E = (ch.nuE || 0) * K;
      if (E > 0.05) {
        const z = (now / 35) | 0;
        ctx.strokeStyle = rgba("#c8ecff", 0.85 * E); ctx.lineWidth = 0.55;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = z * 2.3 + i * 2.1, bx = i === 2 ? NU_A1 : tx, by = i === 2 ? 0 : ty;
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(a) * 2.6, by + Math.sin(a) * 2.6);
          ctx.lineTo(bx + Math.cos(a + 0.7) * 5, by + Math.sin(a + 0.7) * 5);
        }
        ctx.stroke();
      }
    },
  };

  const nuSet = (p, d, t, g, b, ga, e) => { p.nuD = d; p.nuT = t; p.nuG = g; p.nuB = b; p.nuGA = ga; p.nuE = e; stamp(p); };
  const NU = {
    slash1: { w0: -2.5, w1: 0.75, a0: 2.8, a1: 1.5, e0: 0.5, e1: 0.1 },
    slash2: { w0: 2.5, w1: -0.9, a0: 0.2, a1: 1.9, e0: 0.4, e1: 0.1 },
    slash3: { w0: -2.2, w1: -2.2 + TAU * 2.5, a0: 2.5, a1: 1.7, e0: 0.4, e1: 0.2, spin: true },
    thrust: { w0: -0.5, w1: 0.0, a0: 0.2, a1: 1.57, e0: 1.2, e1: 0.0, jab: true },
    rise:   { w0: 2.3, w1: -2.4, a0: 0.3, a1: 2.9, e0: 0.5, e1: 0.1 },
    cross:  { w0: -2.5, w1: 0.75, a0: 2.8, a1: 1.5, e0: 0.5, e1: 0.1 },
  };
  /** Тело героя в атаке «лёгким» оружием: присед, выпад, пружинистая доводка (общая для нунчаков и когтей). */
  const bodyPose = (P, act, p, k, g, lean) => {
    const ph = act.phase;
    if (ph === "startup" || ph === "travel") {
      const e = easeOut(ph === "travel" ? 1 : k.s);
      Object.assign(P, { lean: -0.14 * e, bodyY: g ? 1 + 1.8 * e : 0, legSpread: 1.4 + 0.5 * e });
    } else if (ph === "active") {
      Object.assign(P, { lean: lean == null ? 0.34 : lean, sx: 1.08, sy: 0.93 });
      if (g) Object.assign(P, { bodyY: 2.2, legSpread: 1.85 });
    } else {
      const e = easeInOut(k.r);
      Object.assign(P, { lean: lerp(0.3, 0.04, e), bodyY: g ? lerp(2.2, 0.5, e) : 0, legSpread: lerp(1.8, 1.3, e) });
    }
  };
  const nuPose = (P, act, p, k) => {
    if (act.def.kit) return;                      // у своих приёмов набора — своя поза
    const nm = BASE[act.name] || act.name;
    if (SKIP[nm]) return;
    const S = NU[nm] || NU.slash1, ph = act.phase, g = ground(p), { h, s, u } = subOf(act, k);
    const kb = baseAng(act, p, S.w0);
    const [w, arm, elb, q] = swing(S, act, k, h, s, u, NU_REST);
    bodyPose(P, act, p, k, g);
    let d = 0, t = 0, grip = 0, e = 0, armB = ph === "active" ? lerp(-1.1, 0.5, q) : ph === "recovery" ? lerp(0.5, -0.3, easeInOut(k.r)) : lerp(-0.3, -1.1, easeOut(k.s));
    if (ph === "active") {
      // в конце взмаха цепь выпрямляется и палка B «щёлкает» (хлёст); круговой удар — вторая палка орбитой вокруг первой
      if (S.spin) { d = 0.9; t = 1.7 * Math.sin(TAU * 1.25 * k.a + 0.6); e = 0.6; P.turn = -easeInOut(k.a); }
      else if (S.jab) { grip = 1; armB = 1.2; d = 0; }
      else {
        d = clamp((q - 0.45) / 0.4, 0, 1); t = 0; e = d * 0.5;
        // фирменное: первый удар — хлёст с вращением корпуса; второй — перехват: вторая палка уходит в заднюю руку (хват двумя руками)
        if (nm === "slash1") P.turn = -0.3 * Math.sin(PI * k.a);
        else if (nm === "slash2") { grip = clamp((q - 0.2) / 0.35, 0, 1); armB = lerp(armB, 1.2, grip); P.turn = 0.3 * Math.sin(PI * k.a); }
      }
    } else if (ph === "startup" && S.jab) { grip = easeOut(k.s); armB = lerp(-0.3, 1.2, grip); }
    nuSet(p, d, t, grip, 0, 0, e);
    Object.assign(P, { armF: arm, elbowF: elb, armB, wBlend: 1, wAngle: kb + (w - S.w0) });
  };

  /* ---------- приёмы: Громовые нунчаки ---------- */
  const nuMoves = {
    // сильная доля + точно вплотную: стойка змеи, палки чертят восьмёрку — три круговых удара, на каждом разряд
    nuEight: {
      kind: "melee", spin: true, hits: 3, startup: 0.05, active: 0.3, recovery: 0.2, cancel: 0.16,
      dmg: 8.5, reach: 44, knock: 210, stun: 0.55, lunge: 40, arc: [-2.8, 2.6], fxR: 1.25, fxW: 0.6, name: "Восьмёрка",
      update(cs, p, act, dt, tA) {
        const g = cs.game;
        if (act.phase !== "active" || (act.sub || 0) === act.neSub) return;
        act.neSub = act.sub || 0;
        g.addAfterimage(p);
        g.fx.sparks(p.x + act.dir * 24, p.y - 22, 8, "#9fd8ff", 230, null, PI, 0.3);
        if (act.neSub > 0) g.fx.ring(p.x, p.y - 20, 8, 44, "#bfe8ff", 0.2, 1.6);
      },
      pose(P, act, p, k) {
        const kbA = baseAng(act, p, NU_REST, "kc"), g = ground(p);
        if (act.phase === "startup") {
          Object.assign(P, { armF: lerp(0.9, 2.2, easeOut(k.s)), elbowF: 0.5, wBlend: 1, wAngle: kbA - TAU * easeOut(k.s), lean: -0.2 * k.s, armB: lerp(-0.3, -1.2, k.s), bodyY: g ? 1 + 2 * k.s : 0, legSpread: 1.5 + 0.4 * k.s });
          nuSet(p, 0, 0, 0, 0, 0, 0);
        } else if (act.phase === "active") {
          // восьмёрка: палка A обходит круг с двумя оборотами, вторая палка качается по обе стороны от неё
          const q = easeInOut(k.a);
          Object.assign(P, { armF: 1.5 + 0.35 * Math.sin(TAU * 1.5 * k.a), elbowF: 0.2, wBlend: 1, wAngle: kbA - TAU * (1 + 2 * q), lean: 0.2, armB: lerp(-1.3, 1.0, Math.abs(Math.sin(PI * q * 2))), turn: -q * 0.9, cloak: -1.2 });
          if (g) Object.assign(P, { bodyY: 2.6, legSpread: 2.0, sx: 1.06, sy: 0.93 });
          nuSet(p, 1, 2.1 * Math.sin(TAU * 1.5 * k.a + 0.5), 0, 0, 0, 1);
        } else {
          const e = easeInOut(k.r);
          Object.assign(P, { armF: lerp(1.5, 0.6, e), elbowF: lerp(0.2, 0.6, e), wBlend: 1, wAngle: kbA - TAU * 3 + wrapPi(NU_REST - (kbA - TAU * 3)) * e, lean: lerp(0.2, 0.04, e), armB: lerp(0.5, -0.3, e), bodyY: g ? lerp(2.6, 0.5, e) : 0, legSpread: lerp(2, 1.3, e) });
          nuSet(p, 0, 0, 0, 0, 0, 0.3 * (1 - e));
        }
      },
    },
    // точное нажатие, цель не вплотную (вместо рывка): короткий шаг и удар вытянутой цепью — палка B летит впереди
    nuLash: {
      kind: "dash", startup: 0.05, active: 0.1, recovery: 0.2, cancel: 0.13,
      dmg: 15, reach: 42, knock: 260, stun: 0.45, speed: 1000, maxTravel: 0.16, arc: [-2.4, 1.4], name: "Хлёст",
      fx(g, p, act) {
        const y = p.y - 20, x0 = p.x + act.dir * 6, x1 = p.x + act.dir * 46;
        g.fx.cut(x0, y, x1, y - 3, "#bfe8ff", 2.4, 0.16); g.fx.cut(x0, y, x1, y - 3, "#ffffff", 0.9, 0.1);
        g.fx.sparks(x1, y, 6, "#9fd8ff", 200, act.dir > 0 ? 0 : PI, 0.7, 0.25);
        g.sfx("slash", 1.4);
      },
      pose(P, act, p, k) {
        const kbA = baseAng(act, p, NU_REST, "kc");
        if (act.phase === "startup") {
          // раскрутка палки над головой, цепь тянется за ней
          Object.assign(P, { armF: lerp(0.9, 2.7, easeOut(k.s)), elbowF: 0.3, wBlend: 1, wAngle: kbA - TAU * easeOut(k.s), lean: -0.18 * k.s, armB: lerp(-0.3, -1.3, k.s), bodyY: 1 + 2 * k.s, legSpread: 1.5 + 0.5 * k.s });
          nuSet(p, 0, 0, 0, 0, 0, 0);
        } else if (act.phase === "travel") {
          Object.assign(P, { armF: 2.4, elbowF: 0.2, wBlend: 1, wAngle: nuA(kbA, -2.2) - TAU, lean: 0.4, tuck: 0.4, sx: 1.12, sy: 0.9, bodyY: 2, armB: -1.2, cloak: -0.9 });
          nuSet(p, 0, 0, 0, 0, 0, 0.4);
        } else if (act.phase === "active") {
          const q = easeOut(Math.min(1, k.a * 2.2));
          Object.assign(P, { armF: lerp(2.4, 1.55, q), elbowF: 0.05, wBlend: 1, wAngle: nuA(kbA, lerp(-2.2, 0.0, q)) - TAU, lean: 0.4, sx: 1.12, sy: 0.9, bodyY: 2.4, legSpread: 2.0, armB: -1.3, cloak: -1.1 });
          nuSet(p, 1, 0, 0, 0, 0, 1);       // вытянутая цепь: палка B летит по линии удара
        } else {
          const e = easeInOut(k.r);
          Object.assign(P, { armF: lerp(1.55, 0.6, e), elbowF: lerp(0.05, 0.6, e), wBlend: 1, wAngle: nuA(kbA, lerp(0.0, NU_REST, e)) - TAU, lean: lerp(0.4, 0.05, e), armB: lerp(-1.1, -0.3, e), bodyY: lerp(2.4, 0.6, e) });
          nuSet(p, 0, 0, 0, 0, 0, 0.5 * (1 - e));
        }
      },
    },
    // враги с двух сторон + точно: палка выстреливает вперёд, цепь натягивается — и вторая палка вылетает из-под мышки назад
    nuCatch: {
      kind: "custom", name: "Перехват", startup: 0.06, active: 0.26, recovery: 0.24, cancel: 0.18,
      dmg: 11, reach: 52, knock: 250, stun: 0.55, hits: 2,
      fx(g, p, act) { mark(g.combat, "nuCatch"); g.sfx("slash", 1.3); },
      update(cs, p, act, dt, tA) {
        const g = cs.game, def = act.def, d = act.dir;
        p.vx = damp(p.vx, 0, 12, dt);
        if (act.phase !== "active") return;
        const n = Math.min(def.hits - 1, Math.floor((act.t - tA) / (def.active / def.hits)));
        if (act.tick == null || n > act.tick) {
          act.tick = n; act.sub = n; act.hit.clear();
          const side = n ? -d : d, y = p.y - 21;
          g.fx.cut(p.x + side * 4, y, p.x + side * (def.reach + 8), y - 2, "#bfe8ff", 2.6, 0.18);
          g.fx.cut(p.x + side * 4, y, p.x + side * (def.reach + 8), y - 2, "#ffffff", 0.9, 0.12);
          g.fx.sparks(p.x + side * (def.reach - 4), y, 6, "#9fd8ff", 200, side > 0 ? 0 : PI, 0.7, 0.25);
          g.sfx("slash", 1.2 + 0.25 * n); g.camera.shake(n ? 0.2 : 0.12);
        }
        const rear = act.tick === 1, side = rear ? -d : d;
        hitBox(cs, p, act, { x: side > 0 ? p.x - 4 : p.x - def.reach + 4, y: p.y - 34, w: def.reach, h: 36 }, side);
      },
      pose(P, act, p, k) {
        const kbA = baseAng(act, p, NU_REST, "kc");
        if (act.phase === "startup") {
          // палку берут под мышку: вторая палка прижата к корпусу
          Object.assign(P, { armF: lerp(0.9, 1.2, k.s), elbowF: 0.8, wBlend: 1, wAngle: nuA(kbA, lerp(NU_REST, 0.0, k.s)), lean: -0.1, armB: 0.2, bodyY: 1 + 1.6 * k.s, legSpread: 1.8 });
          nuSet(p, 1, 3.0, 0, 0, 0, 0);
        } else if (act.phase === "active") {
          const u = k.a;
          if (u < 0.5) {      // вперёд: палка A в направлении удара, B сложена под мышкой
            const q = easeOut(u * 2);
            Object.assign(P, { armF: 1.55, elbowF: 0.05, wBlend: 1, wAngle: nuA(kbA, 0.0), lean: 0.34, bodyY: 2.2, legSpread: 2.0, sx: 1.1, sy: 0.92, armB: -0.6, cloak: -1 });
            nuSet(p, 1, lerp(3.0, 0.6, q), 0, 0, 0, 0.6);
          } else {            // назад: рука уходит назад, вторая палка вылетает из-под мышки
            const q = easeOut((u - 0.5) * 2);
            Object.assign(P, { armF: lerp(1.55, -1.45, q), elbowF: 0.1, wBlend: 1, wAngle: nuA(kbA, lerp(0.0, PI - 0.1, q)), lean: lerp(0.3, -0.18, q), bodyY: 2.2, legSpread: 2.0, sx: 1.05, headTilt: 0.12 * q, armB: 0.6, cloak: 1.1 });
            nuSet(p, 1, 0, 0, 0, 0, 1);
          }
        } else {
          const e = easeInOut(k.r);
          Object.assign(P, { armF: lerp(-1.45, 0.6, e), elbowF: lerp(0.1, 0.6, e), wBlend: 1, wAngle: nuA(kbA, lerp(PI - 0.1, NU_REST + TAU, e)), lean: lerp(-0.1, 0.04, e), armB: lerp(0.6, -0.3, e), bodyY: lerp(2.2, 0.5, e) });
          nuSet(p, 0, 0, 0, 0, 0, 0);
        }
      },
    },
  };
  // Что именно подменяет выбор (общая логика уже решила, это melee-приём или рывок)
  registerKit("nunchaku", {
    moves: nuMoves,
    pose: nuPose,
    choose(cs, name, c) {
      if (!c.target || c.air) return;
      const ar = around(cs, 70);
      // враги с двух сторон — «Перехват»
      if (["slash1", "slash2", "slash3", "thrust"].includes(name) && c.good && !c.j.offbeat && ar.l >= 1 && ar.r >= 1 && ready(cs, "nuCatch", 1.8)) return "nuCatch";
      // сильная доля вплотную (место подброса) — «Восьмёрка» вместо восходящего разреза
      if (name === "rise") { cs.lastRiseT = cs.time; return "nuEight"; }
      // точный удар издалека — хлёст цепью вместо обычного рывка
      if (name === "dash" && c.good) return "nuLash";
    },
    takedown(cs, kind) { return kind === "xcut" ? "nuThunder" : null; },
  });

  // Нунчаки «ГРОМОВАЯ ДРОБЬ»: раскрутка палки над головой → шаг к врагу → шесть ударов с разных сторон, на каждом разряд →
  // последний — сверху вниз с ударной вспышкой; враг оседает на месте.
  const NT = { t: [0.2, 0.27, 0.34, 0.41, 0.48, 0.62], ang: [-0.8, 0.7, -0.4, 0.5, -0.2, 1.57], side: [-1, 1, -1, 1, -1, 0] };
  registerTakedown("nuThunder", {
    name: "ГРОМОВАЯ ДРОБЬ", dur: 1.0, death: "topple",
    update(cs, td, api) {
      const g = cs.game, p = g.player, e = td.e, d = td.dir, t = api.t, cy = api.cy, col = p.skin.accent;
      p.y = td.py; p.facing = d;
      const near = clamp(e.x - d * (e.w * e.scale * 0.5 + 18), 40, WORLD.w - 40);
      if (t < 0.12) p.x = td.px; else if (t < 0.2) p.x = lerp(td.px, near, easeOut((t - 0.12) / 0.08)); else p.x = near;
      api.once("windup", 0.02, () => g.sfx("dash", 0.9));
      api.once("step", 0.14, () => { api.streak(td.px, near, p.y - 8); g.sfx("dash"); });
      NT.t.forEach((tt, i) => api.once("hit" + i, tt, () => {
        const big = i === 5, a = NT.ang[i] * d, L = (big ? 28 : 22) * e.scale;
        const x0 = e.x - Math.cos(a) * L, y0 = cy - Math.sin(a) * L, x1 = e.x + Math.cos(a) * L, y1 = cy + Math.sin(a) * L;
        g.fx.cut(x0, y0, x1, y1, "#bfe8ff", big ? 3.6 : 2.4, api.life(big ? 0.4 : 0.26));
        g.fx.cut(x0, y0, x1, y1, "#ffffff", big ? 1.4 : 0.9, api.life(big ? 0.3 : 0.2));
        g.fx.sparks(e.x, cy, big ? 8 : 4, "#9fd8ff", 200, null, PI, 0.3);
        if (!api.low) g.fx.glow(e.x, cy, 3, big ? 26 : 14, big ? "#ffffff" : col, api.life(0.14), big ? 0.5 : 0.3);
        g.sfx("slash", 1.2 + 0.08 * i); g.sfx("hit", 0.8 + 0.08 * i);
        e.flash = 0.5; e.hitKick = 0.8; g.camera.shake(big ? 0.22 : 0.07);
      }));
      const sag = clamp((t - 0.2) / 0.4, 0, 1);
      e.tdPose = { lean: -0.1 - 0.2 * sag, bodyY: 3 * sag, sy: 1 - 0.08 * sag, headTilt: -0.25 * sag };
      api.once("fin", 0.7, () => { g.sfx("draw"); api.finish(); });
    },
    pose(cs, p, td) {
      const t = td.t, ph = (a, b) => clamp((t - a) / (b - a), 0, 1);
      const P = { wBlend: 1, legAmp: 0, legSpread: 1.9, bodyY: 2.2, tuck: 0.1 };
      if (t < 0.05) p.anim.pose.wAngle = wrapPi(p.anim.pose.wAngle);
      const W = -TAU * 2;       // ветка угла: раскрутка уходит на два оборота и все удары идут в той же ветке (без обратной раскрутки)
      let idx = -1;
      for (let i = 0; i < NT.t.length; i++) if (t >= NT.t[i] - 0.03) idx = i;
      if (idx < 0) {
        // раскрутка над головой
        const s = easeOut(ph(0, 0.2));
        Object.assign(P, { armF: lerp(0.9, 2.8, s), elbowF: 0.2, wAngle: lerp(NU_REST, -2.4 + W, s), lean: -0.1 - 0.15 * s, armB: lerp(-0.3, -1.3, s), bodyY: 1 + 2 * s });
        nuSet(p, 0.8, 0.6 * Math.sin(t * 40), 0, 0, 0, 0.6 * s);
      } else {
        const ds = t - NT.t[idx], q = easeOut(clamp(ds / 0.07, 0, 1)), r = clamp((ds - 0.08) / 0.12, 0, 1), big = idx === 5;
        const up = idx % 2 === 0;
        Object.assign(P, {
          armF: big ? lerp(2.9, 1.5, q) : up ? lerp(2.7, 1.5, q) : lerp(0.2, 1.9, q), elbowF: lerp(0.4, 0.05, q),
          wAngle: W + (big ? lerp(-2.7, 1.0, q) : up ? lerp(-2.4, 0.8, q) : lerp(2.4, -0.7, q)),
          lean: lerp(-0.1, big ? 0.6 : 0.45, q), sx: 1 + 0.12 * q * (1 - r), sy: 1 - 0.08 * q * (1 - r), armB: lerp(-0.4, -1.3, q), cloak: -0.9 * q, bodyY: 2.2 + 0.8 * q,
        });
        nuSet(p, clamp(q * 1.3, 0, 1) * (1 - r), 0, 0, 0, 0, 1 - r * 0.7);
        if (t > 0.8) {
          const k = easeInOut(ph(0.8, 1.0));
          Object.assign(P, { armF: lerp(1.5, 0.6, k), elbowF: lerp(0.05, 0.6, k), wAngle: W + lerp(1.0, NU_REST, k), lean: lerp(0.4, 0.04, k), bodyY: lerp(3, 0, k), legSpread: lerp(1.9, 1.2, k), armB: lerp(-1.2, -0.3, k), sx: 1, sy: 1, tuck: 0 });
          nuSet(p, 0, 0, 0, 0, 0, 0);
        }
      }
      return P;
    },
  });

  // трюки: восьмёрка перед собой, палка под мышкой, пропеллер над головой
  registerTricks("nunchaku", [
    { name: "Восьмёрка", beats: 3, pose(Q, k, p, T, env) {
      const a = TAU * 2 * k;
      Object.assign(Q, { armF: 1.4 + 0.35 * Math.sin(a + 1), elbowF: 0.4, armB: -0.5, wBlend: 1, wAngle: -1.1 + 0.9 * Math.sin(a), headTilt: 0.06, legSpread: 1.3 });
      nuSet(p, env, 2.5 * Math.sin(a + 1.3), 0, 0, 0, 0.3 * env);
    } },
    { name: "Под мышкой", beats: 3, pose(Q, k, p, T, env) {
      const sp = easeInOut(clamp(k / 0.45, 0, 1)), tuck = easeInOut(clamp((k - 0.45) / 0.2, 0, 1)), out = easeOut(clamp((k - 0.88) / 0.1, 0, 1));
      Object.assign(Q, { armF: lerp(1.2, 0.9, tuck), elbowF: lerp(0.4, 0.9, tuck), armB: lerp(-0.4, 0.3, tuck), wBlend: 1, wAngle: NU_REST + TAU * 1.5 * sp + tuck * 1.2, headTilt: 0.1 * tuck, lean: -0.03 * tuck });
      nuSet(p, env, lerp(0.8, 3.0, tuck) * (1 - out), 0, 0, 0, 0.2 * env);
    } },
    { name: "Над головой", beats: 2, pose(Q, k, p, T, env) {
      Object.assign(Q, { armF: 2.8, elbowF: 0.25, armB: -0.6, wBlend: 1, wAngle: -0.1 + TAU * 3 * easeInOut(k), headTilt: -0.12, bodyY: 0.4 });
      nuSet(p, env, 0.2 * Math.sin(TAU * 4 * k), 0, 0, 0, 0.5 * env);
    } },
  ]);

  /* =====================================================================
     ВОЛЧЬИ КОГТИ
     ===================================================================== */
  const CL_LEN = [8.6, 10.2, 8.6];
  const CL_OFF = -0.45;                 // когти чуть приподняты относительно предплечья
  /** Рука в когтях: обмотка кулака со скобой над костяшками и три загнутых лезвия (spread — раскрытие веером). */
  const clClaw = (ctx, accent, hq, spread) => {
    ctx.fillStyle = "#0b0c10"; ctx.fillRect(-2.4, -2.3, 4.6, 4.6);
    ctx.fillStyle = rgba(accent, 0.7); ctx.fillRect(-1.2, -2.3, 0.45, 4.6); ctx.fillRect(0.2, -2.3, 0.45, 4.6);
    ctx.fillStyle = "#1c1d25"; ctx.fillRect(2.2, -2.8, 1.1, 5.6);
    for (let i = 0; i < 3; i++) {
      const len = CL_LEN[i];
      ctx.save(); ctx.translate(3.0, (i - 1) * 1.9); ctx.rotate((i - 1) * spread);
      ctx.beginPath(); ctx.moveTo(0, -0.8); ctx.quadraticCurveTo(len * 0.6, -1.1, len, 1.9); ctx.quadraticCurveTo(len * 0.5, 0.3, 0, 0.9); ctx.closePath();
      ctx.fillStyle = "#171820"; ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -0.8); ctx.quadraticCurveTo(len * 0.6, -1.1, len, 1.9);
      if (hq) { ctx.globalAlpha *= 0.32; ctx.lineWidth = 2.6; ctx.strokeStyle = accent; ctx.stroke(); ctx.globalAlpha /= 0.32; }
      ctx.strokeStyle = accent; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(len * 0.25, -0.35); ctx.quadraticCurveTo(len * 0.6, -0.5, len * 0.88, 1.3); ctx.strokeStyle = rgba("#ffffff", 0.18); ctx.lineWidth = 0.3; ctx.stroke();
      ctx.restore();
    }
  };
  WEAPON_DRAW.claws = {
    off: CL_OFF,
    preview(P, ch, act) {
      stamp(ch);
      if (act === "strike") { Object.assign(P, { armF: 2.0, elbowF: 0.1, lean: 0.3, legSpread: 1.7, armB: 1.1 }); ch.clFl = 1; }
      else { Object.assign(P, { armF: 0.9, elbowF: 0.6, lean: 0.06, armB: 0.95, legSpread: 1.3 }); ch.clFl = 0.3; }
    },
    draw(ctx, ch, p, accent, hq) {
      const K = m2Fade(ch), sp = 0.1 + 0.2 * (ch.clFl || 0) * K;
      // задняя лапа: такие же когти на кисти задней руки (дальше от зрителя — темнее, рисуются первыми)
      const bh = backHand(p, CL_OFF);
      ctx.save(); ctx.translate(bh.x, bh.y); ctx.rotate(bh.a + CL_OFF);
      clClaw(ctx, mixc(accent, "#000000", 0.28), hq, sp);
      ctx.restore();
      clClaw(ctx, accent, hq, sp);
    },
  };

  const clSet = (p, fl) => { p.clFl = fl; stamp(p); };
  // F/B — какая рука бьёт (F — передняя, B — задняя); a0/a1, e0/e1 — передняя рука; b0/b1 — задняя (локоть фиксирован 0,5);
  // alt — на многоударных приёмах руки бьют по очереди
  const CL = {
    slash1: { who: "FB", a0: 2.9, a1: 0.9, e0: 0.25, e1: 0.1, b0: 3.0, b1: 0.8 },      // обе лапы рвут сверху вниз разом
    slash2: { who: "B", a0: 0.9, a1: 0.2, e0: 0.5, e1: 0.2, b0: 3.0, b1: 0.9 },
    slash3: { who: "FB", a0: 1.7, a1: 1.7, e0: 0.1, e1: 0.1, b0: 1.1, b1: 1.1, spin: true },
    thrust: { who: "FB", a0: 0.6, a1: 1.57, e0: 1.2, e1: 0.0, b0: -0.3, b1: 1.1, alt: true },
    rise:   { who: "FB", a0: 0.2, a1: 2.9, e0: 0.4, e1: 0.1, b0: 0.2, b1: 2.5 },
    cross:  { who: "FB", a0: 2.8, a1: 1.0, e0: 0.2, e1: 0.1, b0: 2.9, b1: 0.9, alt: true },
  };
  const CL_GUARD = { a: 0.95, e: 0.65, b: 0.55 };      // боевая стойка: обе лапы перед грудью
  const clPose = (P, act, p, k) => {
    if (act.def.kit) return;
    const nm = BASE[act.name] || act.name;
    if (SKIP[nm]) return;
    const S = CL[nm] || CL.slash1, ph = act.phase, g = ground(p), { h, s, u } = subOf(act, k);
    let atkF = S.who.includes("F"), atkB = S.who.includes("B");
    if (h > 1 && S.alt) { atkF = s % 2 === 0; atkB = !atkF; }
    let aF = CL_GUARD.a, eF = CL_GUARD.e, aB = CL_GUARD.b, fl = 0.3;
    if (ph === "startup" || ph === "travel") {
      const e = easeOut(ph === "travel" ? 1 : k.s);
      if (atkF) { aF = lerp(CL_GUARD.a, S.a0, e); eF = lerp(CL_GUARD.e, S.e0, e); }
      if (atkB) aB = lerp(CL_GUARD.b, S.b0, e);
      fl = 0.3 + 0.4 * e;
    } else if (ph === "active") {
      const q = S.spin ? easeInOut(k.a) : easeOut(h > 1 ? u : k.a);
      if (atkF) { aF = lerp(S.a0, S.a1, q); eF = lerp(S.e0, S.e1, q); } else { aF = h > 1 ? lerp(S.a1, CL_GUARD.a, 0.5) : aF; }
      if (atkB) aB = lerp(S.b0, S.b1, q);
      fl = 1;
      if (S.spin) P.turn = -q;
    } else {
      const e = easeInOut(k.r);
      if (atkF) { aF = lerp(S.a1, CL_GUARD.a, e); eF = lerp(S.e1, CL_GUARD.e, e); }
      if (atkB) aB = lerp(S.b1, CL_GUARD.b, e);
      fl = lerp(1, 0.3, e);
    }
    bodyPose(P, act, p, k, g, 0.5);
    // звериная стойка: глубокий присед, широко расставленные ноги, голова вперёд; удары — пружинистым броском корпуса
    if (g) { P.bodyY = (P.bodyY || 0) + 2.2; P.legSpread = Math.max(P.legSpread || 1, 2.0); }
    P.headTilt = (P.headTilt || 0) + 0.18;
    if (ph === "startup" || ph === "travel") P.lean = Math.min(P.lean || 0, -0.02);
    if (ph === "active" && !S.spin) { P.sx = 1.12; P.sy = 0.9; P.cloak = 1.2 * (s % 2 ? -1 : 1); }
    Object.assign(P, { armF: aF, elbowF: eF, armB: aB, wBlend: 0 });
    clSet(p, fl);
  };

  /* ---------- приёмы: Волчьи когти ---------- */
  const clMoves = {
    // сильная доля + точно вплотную: когти крест-накрест снизу вверх (вместо подброса) — два удара, на втором отбрасывает
    clRend: {
      kind: "melee", hits: 2, startup: 0.04, active: 0.2, recovery: 0.2, cancel: 0.15,
      dmg: 9, reach: 40, knock: 320, stun: 0.55, lunge: 70, arc: [-0.3, 3.0], fxR: 1.1, fxW: 0.7, name: "Разрыв",
      update(cs, p, act, dt, tA) {
        const g = cs.game;
        if (act.phase !== "active" || (act.sub || 0) === act.crSub) return;
        act.crSub = act.sub || 0;
        const cx = p.x + act.dir * 24, cy = p.y - 20, s = act.crSub ? 1 : -1;
        for (let i = -1; i <= 1; i++) g.fx.cut(cx - act.dir * 12 * s, cy + 16 + i * 4, cx + act.dir * 14 * s, cy - 18 + i * 4, i ? p.skin.accent : "#ffffff", i ? 1.6 : 1.1, 0.16);
        g.fx.sparks(cx, cy, 5, p.skin.accent, 190, act.dir > 0 ? -0.9 : PI + 0.9, 1.6, 0.3);
        g.addAfterimage(p);
      },
      pose(P, act, p, k) {
        const g = ground(p);
        if (act.phase === "startup") {
          // пригнуться, лапы скрещены внизу
          Object.assign(P, { armF: lerp(0.95, 0.3, easeOut(k.s)), elbowF: 0.5, armB: lerp(0.55, 0.1, easeOut(k.s)), wBlend: 0, lean: 0.1 * k.s, bodyY: g ? 1 + 2.4 * easeOut(k.s) : 0, legSpread: 1.5 + 0.5 * k.s, sy: 1 - 0.06 * k.s });
          clSet(p, 0.7);
        } else if (act.phase === "active") {
          const { s, u } = subOf(act, k), q = easeOut(u);
          // первый удар — передняя лапа снизу вверх, второй — задняя; обе поднимаются выше головы
          Object.assign(P, { armF: s ? lerp(2.9, 2.2, q) : lerp(0.3, 2.9, q), elbowF: 0.15, armB: s ? lerp(0.3, 2.9, q) : lerp(0.2, 0.9, q), wBlend: 0, lean: -0.1, bodyY: g ? 1.6 - 1.4 * q : 0, sx: 0.96, sy: 1.08, legSpread: 1.7, headTilt: -0.12, cloak: 0.9 });
          clSet(p, 1);
        } else {
          const e = easeInOut(k.r);
          Object.assign(P, { armF: lerp(2.2, CL_GUARD.a, e), elbowF: lerp(0.15, CL_GUARD.e, e), armB: lerp(2.9, CL_GUARD.b, e), wBlend: 0, lean: lerp(-0.1, 0.04, e), bodyY: g ? lerp(0.2, 0, e) : 0, legSpread: lerp(1.7, 1.3, e) });
          clSet(p, 1 - 0.7 * e);
        }
      },
    },
    // то же при груве ≥ 2: шесть быстрых ударов обеими лапами по очереди, лапы мелькают; на каждом брызги искр
    clFrenzy: {
      kind: "melee", hits: 6, startup: 0.04, active: 0.42, recovery: 0.2, cancel: 0.3,
      dmg: 4.5, reach: 38, knock: 260, stun: 0.5, lunge: 70, arc: [-2.6, 1.0], fxR: 0.9, fxW: 0.6, name: "Бешенство",
      update(cs, p, act, dt, tA) {
        const g = cs.game;
        if (act.phase !== "active" || (act.sub || 0) === act.cfSub) return;
        act.cfSub = act.sub || 0;
        const cx = p.x + act.dir * 22, cy = p.y - 20, s = act.cfSub % 2 ? 1 : -1;
        g.fx.cut(cx - act.dir * 14, cy - 15 * s, cx + act.dir * 16, cy + 15 * s, p.skin.accent, 1.5, 0.12);
        g.fx.cut(cx - act.dir * 14, cy - 15 * s + 4, cx + act.dir * 16, cy + 15 * s + 4, "#ffffff", 0.9, 0.1);
        g.fx.sparks(cx, cy, 3, p.skin.accent, 170, act.dir > 0 ? -0.5 : PI + 0.5, 1.6, 0.25);
        if (act.cfSub > 0) p.vx = act.dir * 55;
      },
      pose(P, act, p, k) {
        const g = ground(p);
        if (act.phase === "startup") {
          Object.assign(P, { armF: lerp(0.95, 1.9, easeOut(k.s)), elbowF: 0.4, armB: lerp(0.55, 1.9, easeOut(k.s)), wBlend: 0, lean: -0.1 * k.s, bodyY: g ? 1 + 2 * k.s : 0, legSpread: 1.5 + 0.5 * k.s });
          clSet(p, 0.8);
        } else if (act.phase === "active") {
          const { s, u } = subOf(act, k), q = easeOut(Math.min(1, u * 1.5)), f = s % 2 === 0;
          // руки поочерёдно: ударяющая — сверху вниз-вперёд, вторая отведена; корпус качается
          Object.assign(P, { armF: f ? lerp(2.7, 1.2, q) : lerp(1.3, 2.4, q), elbowF: 0.15, armB: f ? lerp(1.9, 2.2, q) : lerp(2.8, 1.0, q), wBlend: 0, lean: 0.34 + 0.08 * (s % 2), bodyY: g ? 2.3 + 0.5 * (s % 2) : 0, legSpread: 1.9, sx: 1.08, sy: 0.92, headTilt: f ? 0.1 : -0.1, cloak: f ? -0.9 : 0.9 });
          clSet(p, 1);
        } else {
          const e = easeInOut(k.r);
          Object.assign(P, { armF: lerp(1.2, CL_GUARD.a, e), elbowF: lerp(0.15, CL_GUARD.e, e), armB: lerp(2.2, CL_GUARD.b, e), wBlend: 0, lean: lerp(0.3, 0.04, e), bodyY: g ? lerp(2.4, 0.4, e) : 0, legSpread: lerp(1.9, 1.3, e) });
          clSet(p, 1 - 0.7 * e);
        }
      },
    },
    // точное нажатие, цель не вплотную (вместо рывка): низкий бросок на врага обеими лапами, в конце удар крестом
    clPounce: {
      kind: "dash", startup: 0.06, active: 0.1, recovery: 0.2, cancel: 0.13,
      dmg: 16, reach: 36, knock: 250, stun: 0.45, speed: 1100, maxTravel: 0.18, arc: [-2.6, 1.4], name: "Прыжок волка",
      fx(g, p, act) {
        const cx = p.x + act.dir * 26, cy = p.y - 20;
        g.fx.cut(cx - act.dir * 14, cy - 16, cx + act.dir * 14, cy + 16, p.skin.accent, 2.4, 0.18);
        g.fx.cut(cx - act.dir * 14, cy + 16, cx + act.dir * 14, cy - 16, p.skin.accent, 2.4, 0.18);
        g.fx.cut(cx - act.dir * 14, cy - 16, cx + act.dir * 14, cy + 16, "#ffffff", 0.9, 0.12);
        g.fx.cut(cx - act.dir * 14, cy + 16, cx + act.dir * 14, cy - 16, "#ffffff", 0.9, 0.12);
        g.sfx("slash", 1.4);
      },
      pose(P, act, p, k) {
        if (act.phase === "startup") {
          // пригнуться к земле, лапы отведены назад
          Object.assign(P, { armF: lerp(0.95, -0.9, easeOut(k.s)), elbowF: 0.3, armB: lerp(0.55, -1.5, easeOut(k.s)), wBlend: 0, lean: 0.25 * k.s, bodyY: 1 + 3 * easeOut(k.s), sy: 1 - 0.1 * k.s, sx: 1 + 0.08 * k.s, legSpread: 2.0 });
          clSet(p, 0.5);
        } else if (act.phase === "travel") {
          Object.assign(P, { armF: 1.5, elbowF: 0.05, armB: 1.0, wBlend: 0, lean: 0.5, tuck: 0.4, sx: 1.14, sy: 0.9, bodyY: 2, cloak: -1.1 });
          clSet(p, 1);
        } else if (act.phase === "active") {
          const q = easeOut(Math.min(1, k.a * 2));
          Object.assign(P, { armF: lerp(1.5, 2.4, q), elbowF: 0.1, armB: lerp(1.0, 2.8, q), wBlend: 0, lean: 0.45, sx: 1.12, sy: 0.92, bodyY: 2.4, legSpread: 2.1, cloak: -1 });
          clSet(p, 1);
        } else {
          const e = easeInOut(k.r);
          Object.assign(P, { armF: lerp(2.4, CL_GUARD.a, e), elbowF: lerp(0.1, CL_GUARD.e, e), armB: lerp(2.8, CL_GUARD.b, e), wBlend: 0, lean: lerp(0.4, 0.04, e), bodyY: lerp(2.4, 0.4, e), legSpread: lerp(2, 1.3, e) });
          clSet(p, 1 - 0.7 * e);
        }
      },
    },
  };
  registerKit("claws", {
    moves: clMoves,
    pose: clPose,
    choose(cs, name, c) {
      if (!c.target || c.air) return;
      // сильная доля вплотную (место подброса): «Разрыв», при груве ≥ 2 — «Бешенство»
      if (name === "rise") { cs.lastRiseT = cs.time; return cs.groove >= 2 ? "clFrenzy" : "clRend"; }
      // точный удар издалека — прыжок вместо рывка
      if (name === "dash" && c.good) return "clPounce";
    },
    takedown(cs, kind) { return kind === "xcut" ? "clMaul" : null; },
  });

  /** Диагональный росчерк через центр врага (линия разреза для половинок). */
  const diag = (g, e, dir, col, w, life, big = false) => {
    const a = dir * 0.75, L = (big ? 46 : 38) * e.scale, cy = e.centerY;
    const x0 = e.x - Math.cos(a) * L, y0 = cy - Math.sin(a) * L, x1 = e.x + Math.cos(a) * L, y1 = cy + Math.sin(a) * L;
    g.fx.cut(x0, y0, x1, y1, col, w, life);
    g.fx.cut(x0, y0, x1, y1, "#ffffff", w * 0.36, life * 0.75);
  };
  // Когти «ЧЕТЫРЕ БОРОЗДЫ»: бросок на врага → четыре тройных росчерка когтей поочерёдно (по три параллельных борозды) →
  // скрещённый финальный удар, враг распадается по диагонали.
  const CM = { t: [0.24, 0.32, 0.4, 0.48], ang: [0.9, -0.9, 0.5, -0.5] };
  registerTakedown("clMaul", {
    name: "ЧЕТЫРЕ БОРОЗДЫ", dur: 1.0, death: "split",
    update(cs, td, api) {
      const g = cs.game, p = g.player, e = td.e, d = td.dir, t = api.t, cy = api.cy, col = p.skin.accent;
      p.y = td.py; p.facing = d;
      const near = clamp(e.x - d * (e.w * e.scale * 0.5 + 16), 40, WORLD.w - 40);
      if (t < 0.1) p.x = td.px; else if (t < 0.2) p.x = lerp(td.px, near, easeInOut((t - 0.1) / 0.1)); else p.x = near;
      api.once("leap", 0.12, () => { api.streak(td.px, near, p.y - 14); g.sfx("dash"); g.camera.shake(0.08); });
      CM.t.forEach((tt, i) => api.once("claw" + i, tt, () => {
        const a = CM.ang[i] * d;
        // три параллельные борозды, смещённые по нормали
        for (let j = -1; j <= 1; j++) {
          const nx = -Math.sin(a) * j * 6 * e.scale, ny = Math.cos(a) * j * 6 * e.scale, L = 24 * e.scale;
          g.fx.cut(e.x + nx - Math.cos(a) * L, cy + ny - Math.sin(a) * L, e.x + nx + Math.cos(a) * L, cy + ny + Math.sin(a) * L, col, 2, api.life(0.3));
          g.fx.cut(e.x + nx - Math.cos(a) * L, cy + ny - Math.sin(a) * L, e.x + nx + Math.cos(a) * L, cy + ny + Math.sin(a) * L, "#ffffff", 0.7, api.life(0.2));
        }
        g.fx.sparks(e.x, cy, 4, col, 170, null, PI, 0.25);
        g.sfx("slash", 1.3 + 0.1 * i); g.sfx("hit", 0.8 + 0.1 * i);
        e.flash = 0.5; e.hitKick = 0.8; g.camera.shake(0.08);
      }));
      // врага удерживает на месте — вздрагивает от ударов
      e.tdPose = { lean: -0.12 * clamp((t - 0.2) / 0.3, 0, 1), headTilt: -0.15 * clamp((t - 0.2) / 0.3, 0, 1) };
      api.once("cross", 0.62, () => {
        diag(g, e, d, col, 3.6, api.life(0.4), true);
        g.fx.cut(e.x + d * 22, cy - 30, e.x - d * 22, cy + 30, "#ffffff", 1.2, api.life(0.3));
        if (!api.low) g.fx.glow(e.x, cy, 5, 28, "#ffffff", api.life(0.2), 0.5);
        g.sfx("slash", 1.6);
      });
      api.once("fin", 0.7, () => { g.sfx("hit", 1.2, true); api.finish(); });
    },
    pose(cs, p, td) {
      const t = td.t, ph = (a, b) => clamp((t - a) / (b - a), 0, 1);
      const P = { wBlend: 0, legAmp: 0, legSpread: 1.9, bodyY: 2.4, tuck: 0.1 };
      let idx = -1;
      for (let i = 0; i < CM.t.length; i++) if (t >= CM.t[i] - 0.03) idx = i;
      if (t < 0.1) {
        const s = easeOut(ph(0, 0.1));
        Object.assign(P, { armF: lerp(0.95, -0.9, s), elbowF: 0.3, armB: lerp(0.55, -1.5, s), lean: 0.2 * s, bodyY: 1 + 3 * s, sy: 1 - 0.08 * s });
        clSet(p, 0.6);
      } else if (t < 0.2) {
        Object.assign(P, { armF: 1.5, elbowF: 0.05, armB: 1.0, lean: 0.55, tuck: 0.5, sx: 1.14, sy: 0.9, cloak: -1.1 });
        clSet(p, 1);
      } else if (idx >= 0 && t < 0.62) {
        const ds = t - CM.t[idx], q = easeOut(clamp(ds / 0.07, 0, 1)), f = idx % 2 === 0;
        Object.assign(P, { armF: f ? lerp(2.8, 1.1, q) : lerp(1.4, 2.5, q), elbowF: 0.15, armB: f ? lerp(1.9, 2.3, q) : lerp(2.9, 0.9, q), lean: 0.4, sx: 1.1, sy: 0.92, headTilt: f ? 0.1 : -0.1, cloak: f ? -0.9 : 0.9 });
        clSet(p, 1);
      } else if (t < 0.8) {
        // обе лапы вверх и вниз крестом
        const q = easeOut(ph(0.56, 0.68));
        Object.assign(P, { armF: lerp(2.6, 1.0, q), elbowF: 0.1, armB: lerp(2.9, 0.8, q), lean: 0.5, bodyY: 3, sx: 1.14, sy: 0.88, cloak: -1.2 });
        clSet(p, 1);
      } else {
        const k = easeInOut(ph(0.8, 1.0));
        Object.assign(P, { armF: lerp(1.0, CL_GUARD.a, k), elbowF: lerp(0.1, CL_GUARD.e, k), armB: lerp(0.8, CL_GUARD.b, k), lean: lerp(0.4, 0.04, k), bodyY: lerp(3, 0, k), legSpread: lerp(1.9, 1.2, k), headTilt: -0.08 * Math.sin(k * PI) });
        clSet(p, 1 - 0.7 * k);
      }
      return P;
    },
  });

  // трюки: скрежет когтями крест-накрест, размять лапы, оскал (присед, лапы по сторонам)
  registerTricks("claws", [
    { name: "Скрежет", beats: 2, pose(Q, k, p, T, env) {
      const sc = Math.sin(TAU * 4 * k);
      Object.assign(Q, { armF: 1.3 + 0.12 * sc, elbowF: 0.35, armB: 1.0 - 0.12 * sc, headTilt: 0.06, wBlend: 0 });
      clSet(p, 0.8 * env);
    } },
    { name: "Размять когти", beats: 3, pose(Q, k, p, T, env) {
      const f = k < 0.5, w = Math.sin(TAU * 3 * (f ? k : k - 0.5));
      Object.assign(Q, { armF: f ? 2.0 + 0.2 * w : 0.7, elbowF: f ? 0.8 : 0.5, armB: f ? 0.4 : 2.1 + 0.2 * w, headTilt: f ? 0.12 : -0.12, wBlend: 0 });
      clSet(p, 0.5 + 0.5 * Math.abs(w) * env);
    } },
    { name: "Оскал", beats: 3, pose(Q, k, p, T, env) {
      const sh = Math.sin(TAU * 7 * k) * 0.04;
      Object.assign(Q, { armF: 2.3 + sh, elbowF: 0.2, armB: 2.6 - sh, headTilt: -0.12, wBlend: 0, bodyY: 1.6 * env, legSpread: 1.35 + 0.3 * env, lean: 0.05 });
      clSet(p, env);
    } },
  ]);

  /* =====================================================================
     ДВОЙНАЯ СТАЛЬ — катана в передней руке (рисунок WEAPON_DRAW.katana) + кинжал обратным хватом в задней
     ===================================================================== */
  const TS_REST = -0.55;                        // катана остриём вперёд-вверх (WEAPON_DRAW.off = −0.55 при wBlend 0)
  const TS_G = { w: -0.75, a: 0.75, e: 0.6, b: 0.95 };    // боевая стойка дуэлянта: катана вперёд, кинжал у груди
  /** Кинжал: рукоять с оплёткой, гарда, широкий короткий клинок с долом (хват обратный — острие к локтю). */
  const m2Dagger = (ctx, accent, hq) => {
    ctx.fillStyle = "#0b0c10"; ctx.fillRect(-2.6, -1, 3, 2);
    ctx.fillStyle = rgba(accent, 0.6); ctx.fillRect(-2, -1, 0.4, 2); ctx.fillRect(-0.9, -1, 0.4, 2);
    ctx.fillStyle = "#1b1c23"; ctx.fillRect(0.3, -2.2, 0.9, 4.4);
    ctx.beginPath(); ctx.moveTo(1.2, -1.2); ctx.lineTo(9.4, -1.0); ctx.lineTo(11, 0.2); ctx.lineTo(1.2, 1.2); ctx.closePath();
    ctx.fillStyle = "#171820"; ctx.fill();
    ctx.beginPath(); ctx.moveTo(1.4, 0); ctx.lineTo(8.4, 0); ctx.strokeStyle = rgba("#ffffff", 0.16); ctx.lineWidth = 0.35; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(1.2, -1.2); ctx.lineTo(9.4, -1.0); ctx.lineTo(11, 0.2);
    if (hq) { ctx.globalAlpha *= 0.35; ctx.lineWidth = 3; ctx.strokeStyle = accent; ctx.stroke(); ctx.globalAlpha /= 0.35; }
    ctx.strokeStyle = accent; ctx.lineWidth = 0.7; ctx.stroke();
  };
  WEAPON_DRAW.twinsteel = {
    off: -0.55,
    preview(P, ch, act) {
      stamp(ch); ch.tsB = 0;
      if (act === "strike") Object.assign(P, { armF: 2.0, elbowF: 0.1, lean: 0.25, legSpread: 1.6, armB: 1.4 });
      else Object.assign(P, { armF: 0.8, elbowF: 0.6, lean: 0.04, armB: 0.95, legSpread: 1.35 });
    },
    draw(ctx, ch, p, accent, hq) {
      const K = m2Fade(ch);
      // кинжал во второй руке: обратный хват — острие вдоль предплечья к локтю; p.tsB поворачивает клинок вокруг кисти
      const bh = backHand(p, WEAPON_DRAW.twinsteel.off);
      ctx.save(); ctx.translate(bh.x, bh.y); ctx.rotate(bh.a + PI - 0.2 + (ch.tsB || 0) * K);
      m2Dagger(ctx, accent, hq);
      ctx.restore();
      WEAPON_DRAW.katana.draw(ctx, ch, p, accent, hq);
    },
  };

  const tsSet = (p, d) => { p.tsB = d; stamp(p); };
  // K — бьёт катана, D — кинжал; w0/w1 и a/e — катана; b0/b1 (armB) и d0/d1 (поворот кинжала) — вторая рука
  const TS = {
    slash1: { who: "KD", w0: -2.5, w1: 0.75, a0: 2.8, a1: 1.5, e0: 0.5, e1: 0.1, b0: 2.6, b1: 0.4, d0: 0, d1: 0.9 },
    slash2: { who: "KD", w0: 2.5, w1: -0.9, a0: 0.2, a1: 1.9, e0: 0.4, e1: 0.1, b0: 2.9, b1: 0.9, d0: 0, d1: 0.9 },
    slash3: { who: "KD", w0: -2.2, w1: -2.2 + TAU, a0: 2.4, a1: 1.6, e0: 0.4, e1: 0.2, b0: -0.9, b1: 2.4, d0: 0, d1: 0.6, spin: true },
    thrust: { who: "K", w0: -0.1, w1: 0.0, a0: -0.4, a1: 1.57, e0: 1.5, e1: 0.0, b0: 1.3, b1: 0.6, d0: 0, d1: 0.3, jab: true },
    rise:   { who: "KD", w0: 2.4, w1: -2.4, a0: 0.3, a1: 2.8, e0: 0.5, e1: 0.1, b0: 0.2, b1: 2.5, d0: 0, d1: 1.0 },
    cross:  { who: "KD", w0: -2.5, w1: 0.75, a0: 2.8, a1: 1.5, e0: 0.5, e1: 0.1, b0: 2.9, b1: 0.9, d0: 0, d1: 0.9, alt: true },
  };
  const tsPose = (P, act, p, k) => {
    if (act.def.kit) return;
    const nm = BASE[act.name] || act.name;
    if (SKIP[nm]) return;
    const S = TS[nm] || TS.slash1, ph = act.phase, g = ground(p), { h, s, u } = subOf(act, k);
    let atkK = S.who.includes("K"), atkD = S.who.includes("D");
    if (h > 1 && S.alt) { atkK = s % 2 === 0; atkD = !atkK; }
    let w = TS_G.w, arm = TS_G.a, elb = TS_G.e, kb = 0, bB = TS_G.b, dd = 0;
    if (atkK) {
      kb = baseAng(act, p, S.w0);
      const kk = S.alt && h > 1 ? { s: k.s, a: u, r: k.r } : k;
      const r = swing(S, act, kk, S.alt ? 1 : h, s, u, TS_REST);
      w = r[0]; arm = r[1]; elb = r[2];
    } else { kb = TS_G.w; w = TS_G.w; }
    if (atkD) {
      if (ph === "startup" || ph === "travel") { const e = easeOut(ph === "travel" ? 1 : k.s); bB = lerp(TS_G.b, S.b0, e); dd = lerp(0, S.d0, e); }
      else if (ph === "active") { const q = S.spin ? easeInOut(k.a) : easeOut(S.alt && h > 1 ? u : k.a); bB = lerp(S.b0, S.b1, q); dd = lerp(S.d0, S.d1, q); }
      else { const e = easeInOut(k.r); bB = lerp(S.b1, TS_G.b, e); dd = lerp(S.d1, 0, e); }
    } else if (atkK) {
      // вторая рука уравновешивает удар катаны
      if (ph === "startup" || ph === "travel") bB = lerp(TS_G.b, S.b0, easeOut(ph === "travel" ? 1 : k.s));
      else if (ph === "active") bB = lerp(S.b0, S.b1, easeOut(k.a));
      else bB = lerp(S.b1, TS_G.b, easeInOut(k.r));
      dd = ph === "active" ? S.d1 * easeOut(k.a) : 0;
    }
    bodyPose(P, act, p, k, g, 0.42);
    if (S.spin && ph === "active") P.turn = -easeInOut(k.a);
    Object.assign(P, { armF: arm, elbowF: elb, armB: bB, wBlend: 1, wAngle: atkK ? kb + (w - S.w0) : w });
    tsSet(p, dd);
  };

  /* ---------- приёмы: Двойная сталь ---------- */
  const tsMoves = {
    // сильная доля + точно вплотную: катана рубит сверху вниз, кинжал тут же снизу вверх — клинки сходятся, как ножницы
    tsScissors: {
      kind: "melee", hits: 2, startup: 0.05, active: 0.22, recovery: 0.2, cancel: 0.16,
      dmg: 11, reach: 46, knock: 300, stun: 0.55, lunge: 80, arc: [-2.5, 1.2], fxR: 1.15, fxW: 0.65, name: "Ножницы",
      update(cs, p, act, dt, tA) {
        const g = cs.game;
        if (act.phase !== "active" || (act.sub || 0) === act.tsSub) return;
        act.tsSub = act.sub || 0;
        const cx = p.x + act.dir * 26, cy = p.y - 20, s = act.tsSub ? -1 : 1;
        g.fx.cut(cx - act.dir * 14, cy - 20 * s, cx + act.dir * 16, cy + 20 * s, act.tsSub ? "#ffffff" : p.skin.accent, act.tsSub ? 1.6 : 2.6, 0.18);
        g.fx.sparks(cx, cy, act.tsSub ? 8 : 4, p.skin.accent, 200, null, PI, 0.3);
        if (act.tsSub) { p.vx = act.dir * 70; g.fx.ring(cx, cy, 4, 26, "#ffffff", 0.16, 1.6); }
        g.addAfterimage(p);
      },
      pose(P, act, p, k) {
        const g = ground(p), kbA = baseAng(act, p, TS_REST, "kc");
        if (act.phase === "startup") {
          // катана поднята над головой, кинжал внизу сзади
          Object.assign(P, { armF: lerp(0.8, 2.8, easeOut(k.s)), elbowF: 0.4, wBlend: 1, wAngle: kbA + (lerp(TS_REST, -2.5, easeOut(k.s)) - TS_REST), lean: -0.14 * k.s, armB: lerp(TS_G.b, 0.0, easeOut(k.s)), bodyY: g ? 1 + 2 * k.s : 0, legSpread: 1.5 + 0.5 * k.s });
          tsSet(p, 0);
        } else if (act.phase === "active") {
          const { s, u } = subOf(act, k), q = easeOut(u);
          if (!s) Object.assign(P, { armF: lerp(2.8, 1.45, q), elbowF: 0.1, wBlend: 1, wAngle: kbA + (lerp(-2.5, 0.75, q) - TS_REST), lean: 0.38, armB: lerp(0.0, 0.3, q), sx: 1.08, sy: 0.93 });
          else Object.assign(P, { armF: lerp(1.45, 1.2, q), elbowF: 0.1, wBlend: 1, wAngle: kbA + (0.75 - TS_REST), lean: 0.3, armB: lerp(0.3, 2.7, q), sx: 1.08, sy: 0.93, headTilt: -0.08 * q });
          if (g) Object.assign(P, { bodyY: 2.4, legSpread: 1.9 });
          tsSet(p, s ? 1.0 * q : 0);
        } else {
          const e = easeInOut(k.r);
          Object.assign(P, { armF: lerp(1.2, TS_G.a, e), elbowF: lerp(0.1, TS_G.e, e), wBlend: 1, wAngle: kbA + (0.75 - TS_REST) + wrapPi(TS_G.w - 0.75) * e, lean: lerp(0.3, 0.04, e), armB: lerp(2.7, TS_G.b, e), bodyY: g ? lerp(2.4, 0.4, e) : 0, legSpread: lerp(1.9, 1.3, e) });
          tsSet(p, 1.0 * (1 - e));
        }
      },
    },
    // точное нажатие, цель не вплотную (вместо рывка): выпад катаной сквозь врага, разворот и удар кинжалом на обратном ходу
    tsLunge: {
      kind: "dash", through: true, startup: 0.05, active: 0.1, recovery: 0.22, cancel: 0.14,
      dmg: 14, reach: 34, knock: 230, stun: 0.5, speed: 1250, maxTravel: 0.19, arc: [-2.4, 1.6], name: "Выпад с перехватом",
      fx(g, p, act) {
        const y = p.y - 20;
        g.fx.cut(p.x - act.dir * 6, y + 8, p.x + act.dir * 36, y - 14, "#ffffff", 1.2, 0.16);
        g.fx.cut(p.x - act.dir * 6, y + 8, p.x + act.dir * 36, y - 14, p.skin.accent, 2.6, 0.2);
        g.fx.sparks(p.x + act.dir * 20, y - 6, 5, p.skin.accent, 180, act.dir > 0 ? 0 : PI, 0.8, 0.25);
        g.sfx("slash", 1.5);
      },
      pose(P, act, p, k) {
        const kbA = baseAng(act, p, TS_REST, "kc");
        if (act.phase === "startup") {
          // катана отведена к бедру остриём вперёд (хира-дзуки), кинжал прижат к груди
          Object.assign(P, { armF: lerp(0.8, -0.2, easeOut(k.s)), elbowF: lerp(0.6, 1.5, k.s), wBlend: 1, wAngle: kbA + (lerp(TS_REST, -0.1, easeOut(k.s)) - TS_REST), lean: -0.16 * k.s, armB: lerp(TS_G.b, 1.3, k.s), bodyY: 1 + 2.4 * k.s, legSpread: 1.5 + 0.6 * k.s, sx: 1 + 0.05 * k.s });
          tsSet(p, 0);
        } else if (act.phase === "travel") {
          // проход: катана вытянута вперёд, корпус параллельно земле
          Object.assign(P, { armF: 1.57, elbowF: 0.0, wBlend: 1, wAngle: kbA + (0.0 - TS_REST), lean: 0.55, tuck: 0.4, sx: 1.15, sy: 0.88, bodyY: 2, armB: -1.3, cloak: -1.2 });
          tsSet(p, 0);
        } else if (act.phase === "active") {
          // за спиной врага герой развернулся: кинжал рубит назад-вверх, катана ушла в сторону
          const q = easeOut(Math.min(1, k.a * 2.2));
          Object.assign(P, { armF: lerp(1.57, 1.0, q), elbowF: 0.2, wBlend: 1, wAngle: kbA + (lerp(0.0, 0.5, q) - TS_REST), lean: 0.4, sx: 1.1, sy: 0.92, bodyY: 2.4, legSpread: 2.0, armB: lerp(2.7, 0.9, q), cloak: -1 });
          tsSet(p, 1.0 * q);
        } else {
          const e = easeInOut(k.r);
          Object.assign(P, { armF: lerp(1.0, TS_G.a, e), elbowF: lerp(0.2, TS_G.e, e), wBlend: 1, wAngle: kbA + (0.5 - TS_REST) + wrapPi(TS_G.w - 0.5) * e, lean: lerp(0.4, 0.04, e), armB: lerp(0.9, TS_G.b, e), bodyY: lerp(2.4, 0.4, e), legSpread: lerp(2, 1.3, e) });
          tsSet(p, 1.0 * (1 - e));
        }
      },
    },
  };
  registerKit("twinsteel", {
    moves: tsMoves,
    pose: tsPose,
    choose(cs, name, c) {
      if (!c.target || c.air) return;
      // сильная доля вплотную (место подброса): «Ножницы»
      if (name === "rise") { cs.lastRiseT = cs.time; return "tsScissors"; }
      // точный удар издалека: выпад с перехватом вместо рывка
      if (name === "dash" && c.good) return "tsLunge";
    },
    takedown(cs, kind) { return kind === "xcut" ? "tsCross" : null; },
  });

  // Двойная сталь «СКРЕЩЁННАЯ СТАЛЬ»: шаг вперёд, оба клинка обнажены → катана сверху вниз, кинжал снизу вверх — крест на враге →
  // тишина (тонкий светящийся крест в воздухе) → клинки в ножны, на щелчке враг распадается.
  registerTakedown("tsCross", {
    name: "СКРЕЩЁННАЯ СТАЛЬ", dur: 1.1, death: "split",
    update(cs, td, api) {
      const g = cs.game, p = g.player, e = td.e, d = td.dir, t = api.t, cy = api.cy, col = p.skin.accent;
      p.y = td.py; p.facing = d;
      const near = clamp(e.x - d * (e.w * e.scale * 0.5 + 20), 40, WORLD.w - 40);
      if (t < 0.14) p.x = td.px; else if (t < 0.26) p.x = lerp(td.px, near, easeOut((t - 0.14) / 0.12)); else p.x = near;
      const X = (w, life, c1) => {
        const L = 36 * e.scale;
        g.fx.cut(e.x - d * L * 0.7, cy - L, e.x + d * L * 0.7, cy + L, c1, w, life);       // катана: сверху вниз
        g.fx.cut(e.x - d * L * 0.7, cy + L, e.x + d * L * 0.7, cy - L, c1, w, life);       // кинжал: снизу вверх
      };
      api.once("draw", 0.04, () => { g.sfx("draw"); });
      api.once("step", 0.15, () => { api.streak(td.px, near, p.y - 10); g.sfx("dash"); });
      api.once("katana", 0.3, () => {
        const L = 36 * e.scale;
        g.fx.cut(e.x - d * L * 0.7, cy - L, e.x + d * L * 0.7, cy + L, col, 3, api.life(0.4));
        g.fx.cut(e.x - d * L * 0.7, cy - L, e.x + d * L * 0.7, cy + L, "#ffffff", 1.1, api.life(0.3));
        g.sfx("slash", 1.5); g.camera.shake(0.12); e.flash = 0.5;
      });
      api.once("dagger", 0.38, () => {
        const L = 36 * e.scale;
        g.fx.cut(e.x - d * L * 0.7, cy + L, e.x + d * L * 0.7, cy - L, col, 3, api.life(0.4));
        g.fx.cut(e.x - d * L * 0.7, cy + L, e.x + d * L * 0.7, cy - L, "#ffffff", 1.1, api.life(0.3));
        if (!api.low) g.fx.glow(e.x, cy, 4, 22, "#ffffff", api.life(0.14), 0.4);
        g.sfx("slash", 1.8); g.camera.shake(0.18); e.flash = 0.5; e.hitKick = 0.9;
      });
      api.once("ghost", 0.55, () => X(0.9, api.life(0.3), "#ffffff"));
      api.once("click", 0.86, () => {
        g.sfx("draw"); g.sfx("hit", 1.2, true);
        diag(g, e, d, col, 3.6, api.life(0.4), true);
        if (!api.low) g.fx.glow(e.x, cy, 5, 26, "#ffffff", api.life(0.2), 0.5);
        api.finish();
      });
    },
    pose(cs, p, td) {
      const t = td.t, ph = (a, b) => clamp((t - a) / (b - a), 0, 1);
      const P = { wBlend: 1, legAmp: 0, legSpread: 2.0 };
      if (t < 0.3) {
        // клинки обнажены: катана над головой, кинжал внизу
        const s = easeOut(ph(0, 0.28));
        Object.assign(P, { armF: lerp(0.8, 2.8, s), elbowF: 0.4, wAngle: lerp(TS_REST, -2.5, s), lean: -0.12 * s, armB: lerp(TS_G.b, 0.0, s), bodyY: 1 + 2.2 * s + 0.3 * Math.sin(t * 70) * s, sy: 1 - 0.06 * s });
        tsSet(p, 0);
      } else if (t < 0.46) {
        const a = easeOut(ph(0.3, 0.36)), b = easeOut(ph(0.36, 0.44));
        Object.assign(P, { armF: lerp(2.8, 1.45, a), elbowF: 0.1, wAngle: lerp(-2.5, 0.75, a), lean: 0.5, armB: lerp(0.0, 2.7, b), bodyY: 2.6, sx: 1.12, sy: 0.9, cloak: -1 });
        tsSet(p, 1.0 * b);
      } else if (t < 0.8) {
        // тишина: клинки скрещены перед собой, лёгкая дрожь
        const s = easeInOut(ph(0.46, 0.64));
        Object.assign(P, { armF: lerp(1.45, 1.2, s), elbowF: lerp(0.1, 0.5, s), wAngle: lerp(0.75, -0.3, s) + 0.04 * Math.sin(t * 60), lean: lerp(0.45, 0.1, s), armB: lerp(2.7, 1.4, s), bodyY: lerp(2.6, 1.4, s), legSpread: 1.8, sx: 1, sy: 1 });
        tsSet(p, lerp(1.0, 0.6, s));
      } else {
        // клинки в ножны — щелчок на 0.86
        const n = easeInOut(ph(0.8, 0.98));
        Object.assign(P, { armF: lerp(1.2, TS_G.a, n), elbowF: lerp(0.5, TS_G.e, n), wAngle: lerp(-0.3, TS_G.w, n), lean: lerp(0.1, 0.0, n), armB: lerp(1.4, TS_G.b, n), bodyY: lerp(1.4, 0, n), legSpread: lerp(1.8, 1.2, n), headTilt: -0.08 * Math.sin(n * PI) });
        tsSet(p, lerp(0.6, 0, n));
      }
      return P;
    },
  });

  // трюки: перехват клинков (кинжал перекидывается в пальцах), катана на плечо с вертушкой кинжала, скрещённая стойка
  registerTricks("twinsteel", [
    { name: "Перехват клинков", beats: 2, pose(Q, k, p, T, env) {
      const sp = easeInOut(clamp(k / 0.7, 0, 1));
      Object.assign(Q, { armF: 1.0, elbowF: 0.55, wBlend: 1, wAngle: TS_REST + 0.5 * Math.sin(TAU * k), armB: 1.1, headTilt: 0.08 });
      tsSet(p, TAU * 2 * sp * env);
    } },
    { name: "Катана на плечо", beats: 3, pose(Q, k, p, T, env) {
      const e = easeOut(clamp(k / 0.3, 0, 1));
      Object.assign(Q, { armF: lerp(0.8, 2.4, e), elbowF: lerp(0.6, 1.8, e), wBlend: 1, wAngle: lerp(TS_REST, -2.5, e), armB: lerp(0.95, 0.7, e), headTilt: 0.08 * Math.sin(TAU * k) * e, lean: -0.04 * e, bodyY: 0.5 * Math.sin(TAU * 2 * k) * e });
      tsSet(p, (TAU * 1.5 * easeInOut(clamp((k - 0.35) / 0.55, 0, 1))) * env);
    } },
    { name: "Скрещённые клинки", beats: 2, pose(Q, k, p, T, env) {
      const e = easeOut(clamp(k / 0.3, 0, 1)), sh = Math.sin(TAU * 3 * k) * 0.05;
      Object.assign(Q, { armF: lerp(0.8, 1.8, e), elbowF: lerp(0.6, 0.5, e), wBlend: 1, wAngle: lerp(TS_REST, -1.25 + sh, e), armB: lerp(0.95, 1.7, e), headTilt: -0.06 * e, legSpread: 1.4, bodyY: 0.6 * e });
      tsSet(p, 0.4 * e * env);
    } },
  ]);

  /* =====================================================================
     СТАЛЬНОЙ ВЕЕР (тэссэн)
     ===================================================================== */
  const TE_R = 15.5, TE_PX = 1.5;
  const TE_SEG = 6;
  /** Веер из стали: сектор из пластин с рёбрами и режущей кромкой по дуге; span ≈ 0,1 — сложен (стержень), 2,6 — раскрыт. */
  const teFan = (ctx, span, accent, hq) => {
    for (let i = 0; i < TE_SEG; i++) {
      const a0 = -span * (i + 1) / TE_SEG, a1 = -span * i / TE_SEG;
      ctx.beginPath(); ctx.moveTo(TE_PX, 0); ctx.arc(TE_PX, 0, TE_R, a0, a1); ctx.closePath();
      ctx.fillStyle = i % 2 ? "#1f2029" : "#171820"; ctx.fill();
    }
    // внутренний узор — дуга и рёбра
    ctx.beginPath(); ctx.arc(TE_PX, 0, TE_R * 0.6, -span, 0);
    ctx.strokeStyle = rgba(accent, 0.4); ctx.lineWidth = 0.4; ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i <= TE_SEG; i++) { const a = -span * i / TE_SEG; ctx.moveTo(TE_PX + Math.cos(a) * 3, Math.sin(a) * 3); ctx.lineTo(TE_PX + Math.cos(a) * TE_R, Math.sin(a) * TE_R); }
    ctx.strokeStyle = "#0b0c10"; ctx.lineWidth = 0.45; ctx.stroke();
    // внешние рёбра-стержни толще, с колпачками
    ctx.beginPath();
    ctx.moveTo(TE_PX, 0); ctx.lineTo(TE_PX + TE_R + 0.5, 0);
    ctx.moveTo(TE_PX, 0); ctx.lineTo(TE_PX + Math.cos(-span) * (TE_R + 0.5), Math.sin(-span) * (TE_R + 0.5));
    ctx.strokeStyle = "#2a2c36"; ctx.lineWidth = 1.5; ctx.lineCap = "round"; ctx.stroke(); ctx.lineCap = "butt";
    ctx.beginPath(); ctx.moveTo(TE_PX + 2, -0.55); ctx.lineTo(TE_PX + TE_R - 1, -0.55); ctx.strokeStyle = rgba(accent, 0.7); ctx.lineWidth = 0.4; ctx.stroke();    // неоновая жилка по стержню
    // режущая кромка
    ctx.beginPath(); ctx.arc(TE_PX, 0, TE_R, -span, 0);
    if (hq) { ctx.globalAlpha *= 0.32; ctx.lineWidth = 3.2; ctx.strokeStyle = accent; ctx.stroke(); ctx.globalAlpha /= 0.32; }
    ctx.strokeStyle = accent; ctx.lineWidth = 0.85; ctx.stroke();
    ctx.fillStyle = accent; ctx.fillRect(TE_PX + TE_R - 0.5, -0.8, 1.1, 1.6);
    ctx.fillStyle = "#9aa1b4"; ctx.beginPath(); ctx.arc(TE_PX, 0, 1.0, 0, TAU); ctx.fill();            // заклёпка
    // рукоять-обмотка у основания
    ctx.fillStyle = "#0b0c10"; ctx.fillRect(-3, -1.1, 3.6, 2.2);
    ctx.fillStyle = rgba(accent, 0.65); ctx.fillRect(-2.2, -1.1, 0.4, 2.2); ctx.fillRect(-1, -1.1, 0.4, 2.2);
  };
  WEAPON_DRAW.tessen = {
    off: -0.9,
    preview(P, ch, act) {
      stamp(ch);
      if (act === "strike") { Object.assign(P, { armF: 1.9, elbowF: 0.1, lean: 0.25, legSpread: 1.6, armB: -0.8, wBlend: 1, wAngle: -0.2 }); ch.teO = 1; }
      else { Object.assign(P, { armF: 0.8, elbowF: 0.6, lean: 0.05, armB: -0.5 }); ch.teO = 0.55; }
      ch.teFly = 0;
    },
    draw(ctx, ch, p, accent, hq) {
      const K = m2Fade(ch), open = clamp((ch.teO || 0) * K, 0, 1);
      if ((ch.teFly || 0) * K > 0.5) {
        // веер брошен: летит отдельно от руки (положение — в осях героя относительно кисти, как груз кусаригамы), кружась
        const m = ctx.getTransform(), al = Math.atan2(m.b, (ch.facing || 1) * m.a);
        ctx.save(); ctx.rotate(-al); ctx.translate(ch.teX || 0, ch.teY || 0); ctx.rotate(ch.teR || 0); ctx.translate(-6, 4);
        teFan(ctx, 2.6, accent, hq);
        ctx.restore();
        return;
      }
      teFan(ctx, 0.12 + 2.5 * open, accent, hq);
    },
  };

  const teSet = (p, o, fly, x, y, r) => { p.teO = o; p.teFly = fly || 0; p.teX = x || 0; p.teY = y || 0; p.teR = r || 0; stamp(p); };
  const TE_REST = -0.9;
  const TE = {
    slash1: { w0: -2.4, w1: 0.9, a0: 2.8, a1: 1.5, e0: 0.5, e1: 0.1, o: 1 },
    slash2: { w0: 2.4, w1: -0.8, a0: 0.3, a1: 1.9, e0: 0.4, e1: 0.1, o: 1 },
    slash3: { w0: -2.2, w1: -2.2 + TAU * 1.5, a0: 2.2, a1: 1.7, e0: 0.4, e1: 0.2, o: 1, spin: true },
    thrust: { w0: -0.3, w1: 0.0, a0: 0.3, a1: 1.57, e0: 1.2, e1: 0.0, o: 0, jab: true },       // сложенный веер колет острым торцом
    rise:   { w0: 2.4, w1: -2.5, a0: 0.3, a1: 2.9, e0: 0.5, e1: 0.1, o: 1 },
    cross:  { w0: -2.4, w1: 0.9, a0: 2.8, a1: 1.5, e0: 0.5, e1: 0.1, o: 1 },
  };
  const tePose = (P, act, p, k) => {
    if (act.def.kit) return;
    const nm = BASE[act.name] || act.name;
    if (SKIP[nm]) return;
    const S = TE[nm] || TE.slash1, ph = act.phase, g = ground(p), { h, s, u } = subOf(act, k);
    const kb = baseAng(act, p, S.w0);
    const [w, arm, elb, q] = swing(S, act, k, h, s, u, TE_REST);
    bodyPose(P, act, p, k, g);
    // раскрытие: на подготовке полураскрыт, на ударе распахивается, на доводке складывается
    const o = ph === "active" ? S.o * easeOut(Math.min(1, k.a * 5)) : ph === "recovery" ? S.o * (1 - easeInOut(Math.min(1, k.r * 1.5))) : S.o * 0.08 * easeOut(ph === "travel" ? 1 : k.s);   // сложен на замахе — «щёлк», распахнулся на ударе
    const armB = ph === "active" ? lerp(-0.9, -1.4, q) : ph === "recovery" ? lerp(-1.2, -0.4, easeInOut(k.r)) : lerp(-0.4, -0.9, easeOut(k.s));
    // танцевальные обороты: полный оборот на вихре и подъёме, на втором ударе — в другую сторону, на первом — полуоборот-перелив
    if (ph === "active") {
      if (S.spin || nm === "rise") P.turn = -easeInOut(k.a);
      else if (nm === "slash2") P.turn = easeInOut(k.a);
      else if (nm === "slash1") P.turn = -0.35 * Math.sin(PI * k.a);
    }
    Object.assign(P, { armF: arm, elbowF: elb, armB, wBlend: 1, wAngle: kb + (w - S.w0) });
    teSet(p, o);
  };

  /** Положение брошенного веера в осях героя относительно кисти: u 0..1 — вылет до цели (0..0,5) и возврат; дуга над линией полёта. */
  const FAN = { x: 0, y: 0, f: 0 };
  const fanAt = (u, dx, dy) => {
    const f = u < 0.5 ? easeOut(u * 2) : 1 - easeIn((u - 0.5) * 2);
    FAN.f = f; FAN.x = dx * f; FAN.y = dy * f - 16 * Math.sin(PI * f);
    return FAN;
  };

  /* ---------- приёмы: Стальной веер ---------- */
  const teMoves = {
    // сильная доля + точно вплотную: веер раскрывается и рубит вверх, затем танцующий оборот — ветер отбрасывает всех рядом
    teGust: {
      kind: "melee", spin: true, hits: 2, startup: 0.06, active: 0.28, recovery: 0.22, cancel: 0.18,
      dmg: 10, reach: 52, knock: 360, stun: 0.6, lunge: 30, arc: [-2.8, 2.6], fxR: 1.5, fxW: 1.0, name: "Порыв",
      update(cs, p, act, dt, tA) {
        const g = cs.game;
        if (act.phase !== "active" || (act.sub || 0) === act.tgSub) return;
        act.tgSub = act.sub || 0;
        const cx = p.x + act.dir * 20, cy = p.y - 22;
        if (!act.tgSub) {
          g.fx.cut(cx - act.dir * 10, cy + 18, cx + act.dir * 16, cy - 28, "#ffffff", 1.4, 0.18);
          g.fx.sparks(cx, cy - 6, 5, p.skin.accent, 190, -PI / 2, 1.2, 0.3);
        } else {
          g.fx.shockwave(p.x, p.y - 4, p.skin.accent, 110); g.fx.ring(p.x, cy, 8, 56, "#ffffff", 0.24, 2);
          g.fx.dust(p.x, p.y, 5);
        }
        g.addAfterimage(p);
      },
      pose(P, act, p, k) {
        const g = ground(p), kbA = baseAng(act, p, TE_REST, "kc");
        if (act.phase === "startup") {
          // веер сложен у бедра, запястье закручено — набирает ветер
          Object.assign(P, { armF: lerp(0.8, 0.1, easeOut(k.s)), elbowF: 0.9, wBlend: 1, wAngle: kbA + (lerp(TE_REST, 2.2, easeOut(k.s)) - TE_REST), lean: -0.1 * k.s, armB: lerp(-0.4, -1.1, k.s), bodyY: g ? 1 + 2 * k.s : 0, legSpread: 1.5 + 0.4 * k.s });
          teSet(p, 0.2 * k.s);
        } else if (act.phase === "active") {
          const { s, u } = subOf(act, k);
          if (!s) {      // рубящий взмах вверх, веер распахнут
            const q = easeOut(u);
            Object.assign(P, { armF: lerp(0.1, 2.9, q), elbowF: 0.2, wBlend: 1, wAngle: kbA + (lerp(2.2, -2.5, q) - TE_REST), lean: -0.06, bodyY: g ? 1.6 : 0, sx: 0.98, sy: 1.06, armB: -1.0, legSpread: 1.8 });
            teSet(p, easeOut(Math.min(1, u * 3)));
          } else {       // оборот на месте с распахнутым веером
            const q = easeInOut(u);
            Object.assign(P, { armF: lerp(2.9, 1.6, q), elbowF: 0.15, wBlend: 1, wAngle: kbA + (-2.5 - TE_REST) - TAU * q, lean: 0.14, bodyY: g ? 2.4 : 0, legSpread: 2.0, sx: 1.05, turn: -q, cloak: -1.2, armB: lerp(-1.0, 1.0, Math.abs(Math.sin(PI * q))) });
            teSet(p, 1);
          }
        } else {
          const e = easeInOut(k.r);
          Object.assign(P, { armF: lerp(1.6, 0.8, e), elbowF: lerp(0.15, 0.6, e), wBlend: 1, wAngle: kbA + (-2.5 - TE_REST) - TAU + wrapPi(TE_REST - (-2.5 - TAU)) * e, lean: lerp(0.14, 0.04, e), armB: lerp(0.3, -0.4, e), bodyY: g ? lerp(2.4, 0.4, e) : 0, legSpread: lerp(2, 1.3, e) });
          teSet(p, 1 - easeInOut(Math.min(1, k.r * 1.5)));
        }
      },
    },
    // точное нажатие, цель не вплотную (вместо рывка): веер летит по дуге к цели, режет, возвращается в руку
    teThrow: {
      kind: "custom", name: "Бросок веера", startup: 0.07, active: 0.4, recovery: 0.2, cancel: 0.32,
      dmg: 9, reach: 40, knock: 220, stun: 0.45, hits: 2,
      fx(g, p, act) { mark(g.combat, "teThrow"); g.sfx("slash", 1.5); },
      update(cs, p, act, dt, tA) {
        const g = cs.game, def = act.def;
        p.vx = damp(p.vx, 0, 12, dt);
        if (!act.thr) {
          act.thr = true; act.sub = 0;
          const tg = act.target && act.target.targetable ? act.target : nearestEnemy(g, p, 260), h = CharacterRenderer.handWorld(p, 0);
          if (tg) { act.dir = sign(tg.x - p.x) || act.dir; p.facing = act.dir; }
          act.thrDX = clamp(tg ? Math.abs(tg.x - h.x) : 130, 60, 230);
          act.thrDY = tg ? tg.centerY - h.y : 2;
        }
        if (act.phase !== "active") return;
        const u = clamp((act.t - tA) / def.active, 0, 1), h = CharacterRenderer.handWorld(p, 0), F = fanAt(u, act.thrDX, act.thrDY);
        const fx = h.x + F.x * p.facing, fy = h.y + F.y;
        if (u >= 0.5 && act.sub === 0) { act.sub = 1; act.hit.clear(); g.sfx("slash", 1.1); }
        if (act.px != null && !g.fx.low) g.fx.line(act.px, act.py, fx, fy, p.skin.accent, 2.2, 0.1);
        act.px = fx; act.py = fy;
        const n = hitCircle(cs, p, act, fx, fy, 15);
        if (n) { g.fx.sparks(fx, fy, 5, p.skin.accent, 180, null, PI, 0.25); g.fx.cut(fx - 12, fy - 10, fx + 12, fy + 10, "#ffffff", 1.2, 0.12); }
      },
      pose(P, act, p, k) {
        const g = ground(p), kbA = baseAng(act, p, TE_REST, "kc");
        const dx = act.thrDX == null ? 120 : act.thrDX, dy = act.thrDY == null ? 2 : act.thrDY;
        if (act.phase === "startup") {
          Object.assign(P, { armF: lerp(0.8, 2.5, easeOut(k.s)), elbowF: 0.5, wBlend: 1, wAngle: kbA + (lerp(TE_REST, -2.0, easeOut(k.s)) - TE_REST), lean: -0.15 * k.s, armB: lerp(-0.4, -1.0, k.s), bodyY: g ? 1 + 2 * k.s : 0, legSpread: 1.5 + 0.4 * k.s });
          teSet(p, lerp(0.2, 0.7, k.s));
        } else if (act.phase === "active") {
          const u = k.a, rel = u < 0.07 ? easeOut(u / 0.07) : 1, F = fanAt(u, dx, dy);
          // бросок: рука с силой вперёд; пока веер в полёте — рука открыта в его сторону, к возврату тянется поймать
          const arm = u < 0.5 ? lerp(2.5, 1.55, rel) : lerp(1.55, 1.9, easeIn((u - 0.5) * 2));
          Object.assign(P, { armF: arm, elbowF: 0.1, wBlend: 1, wAngle: kbA + (lerp(-2.0, 0.0, rel) - TE_REST), lean: 0.3, bodyY: g ? 2.2 : 0, legSpread: 1.9, sx: 1.08, sy: 0.93, armB: -1.2, cloak: -0.9 });
          teSet(p, 1, u > 0.06 && u < 0.97 ? 1 : 0, F.x, F.y, TAU * 5 * u);
        } else {
          const e = easeInOut(k.r);
          Object.assign(P, { armF: lerp(1.9, 0.8, e), elbowF: lerp(0.1, 0.6, e), wBlend: 1, wAngle: kbA + (0.0 - TE_REST) + wrapPi(TE_REST - 0.0) * e, lean: lerp(0.2, 0.04, e), armB: lerp(-1.2, -0.4, e), bodyY: g ? lerp(2.2, 0.4, e) : 0, legSpread: lerp(1.9, 1.3, e) });
          teSet(p, 1 - easeInOut(Math.min(1, k.r * 1.6)));
        }
      },
    },
  };
  registerKit("tessen", {
    moves: teMoves,
    pose: tePose,
    choose(cs, name, c) {
      if (!c.target || c.air) return;
      // сильная доля вплотную (место подброса): «Порыв»
      if (name === "rise") { cs.lastRiseT = cs.time; return "teGust"; }
      // точный удар издалека: бросок веера вместо рывка, не чаще раза в секунду
      if (name === "dash" && c.good && c.dx >= 50 && ready(cs, "teThrow", 1.0)) return "teThrow";
    },
    takedown(cs, kind) { return kind === "xcut" ? "teDance" : null; },
  });

  // Веер «ТАНЕЦ ВЕЕРА»: шаг к врагу, веер раскрыт → три круга танца вокруг него (на каждом кольцо режущих дуг) → веер взлетает
  // над головой, враг оседает; веер возвращается в руку, когда лепестки (осколки) уже опали.
  const TD_T = [0.3, 0.44, 0.58];
  registerTakedown("teDance", {
    name: "ТАНЕЦ ВЕЕРА", dur: 1.15, death: "topple",
    update(cs, td, api) {
      const g = cs.game, p = g.player, e = td.e, d = td.dir, t = api.t, cy = api.cy, col = p.skin.accent;
      p.y = td.py; p.facing = d;
      const near = clamp(e.x - d * (e.w * e.scale * 0.5 + 22), 40, WORLD.w - 40);
      if (t < 0.12) p.x = td.px; else if (t < 0.26) p.x = lerp(td.px, near, easeOut((t - 0.12) / 0.14)); else p.x = near;
      api.once("open", 0.04, () => g.sfx("draw", 1.3));
      api.once("step", 0.14, () => { api.streak(td.px, near, p.y - 10); g.sfx("dash"); });
      TD_T.forEach((tt, i) => api.once("spin" + i, tt, () => {
        const R = (22 + i * 4) * e.scale;
        g.fx.slashArc(e.x, cy, R, 0.4 + i, 0.4 + i + TAU * 0.7, col, 3.5, api.life(0.34));
        g.fx.slashArc(e.x, cy, R - 3, 0.5 + i, 0.5 + i + TAU * 0.6, "#ffffff", 1.2, api.life(0.24));
        g.fx.sparks(e.x, cy, 5, col, 180, null, PI, 0.28);
        if (!api.low) g.fx.glow(e.x, cy, 3, 16, col, api.life(0.14), 0.3);
        g.sfx("slash", 1.2 + 0.15 * i); g.sfx("hit", 0.8 + 0.1 * i);
        e.flash = 0.5; e.hitKick = 0.8; g.camera.shake(0.08 + 0.04 * i);
      }));
      const sag = clamp((t - 0.28) / 0.45, 0, 1);
      e.tdPose = { lean: -0.12 - 0.2 * sag, bodyY: 3 * sag, sy: 1 - 0.1 * sag, headTilt: -0.25 * sag };
      api.once("toss", 0.7, () => { g.sfx("slash", 1.7); g.fx.ring(e.x, cy - 10, 6, 40, "#ffffff", api.life(0.3), 1.8); });
      api.once("fin", 0.82, () => {
        g.fx.shards(e.x, cy, api.low ? 6 : 12, col, 260);
        g.sfx("hit", 1.3, true);
        api.finish();
      });
    },
    pose(cs, p, td) {
      const t = td.t, ph = (a, b) => clamp((t - a) / (b - a), 0, 1);
      const P = { wBlend: 1, legAmp: 0, legSpread: 1.9, bodyY: 2, tuck: 0 };
      if (t < 0.28) {
        const s = easeOut(ph(0, 0.26));
        Object.assign(P, { armF: lerp(0.8, 2.0, s), elbowF: 0.4, wAngle: lerp(TE_REST, -1.6, s), lean: -0.06 * s, armB: lerp(-0.4, -1.2, s), bodyY: 1 + 1.6 * s });
        teSet(p, lerp(0.15, 1, s));
      } else if (t < 0.7) {
        // три оборота: корпус вращается вокруг оси, веер раскрыт на вытянутой руке
        const q = ph(0.28, 0.7), sp = easeInOut(q);
        Object.assign(P, { armF: 1.6 + 0.2 * Math.sin(TAU * 3 * q), elbowF: 0.1, wAngle: -0.3 - TAU * 2 * sp, lean: 0.14, turn: -sp * 3, armB: lerp(-1.2, 1.2, Math.abs(Math.sin(PI * 3 * q))), cloak: -1.2, bodyY: 2.4 });
        teSet(p, 1);
      } else if (t < 0.86) {
        // веер летит вверх и возвращается
        const u = ph(0.7, 0.86), F = fanAt(u, 6, -52);
        Object.assign(P, { armF: lerp(2.4, 2.9, easeOut(Math.min(1, u * 2))), elbowF: 0.1, wAngle: -1.6, lean: -0.12, armB: -0.8, bodyY: 2 - 1.5 * Math.sin(PI * u), headTilt: -0.15 });
        teSet(p, 1, u < 0.97 ? 1 : 0, F.x, F.y, TAU * 6 * u);
      } else {
        const n = easeInOut(ph(0.86, 1.1));
        Object.assign(P, { armF: lerp(2.9, 0.8, n), elbowF: lerp(0.1, 0.6, n), wAngle: -1.6 + wrapPi(TE_REST + 1.6) * n, lean: lerp(-0.1, 0.0, n), armB: lerp(-0.8, -0.4, n), bodyY: lerp(2, 0, n), legSpread: lerp(1.9, 1.2, n), headTilt: -0.08 * Math.sin(n * PI) });
        teSet(p, 1 - n);
      }
      return P;
    },
  });

  // трюки: раскрыть и сложить веер, вертушка на пальце, веер у лица
  registerTricks("tessen", [
    { name: "Раскрытие", beats: 2, pose(Q, k, p, T, env) {
      const f = Math.abs(Math.sin(PI * 2 * k));
      Object.assign(Q, { armF: 1.3 + 0.3 * f, elbowF: 0.5, armB: -0.5, wBlend: 1, wAngle: -0.9 - 0.7 * f, headTilt: 0.06 });
      teSet(p, f * env);
    } },
    { name: "Вертушка веера", beats: 2, pose(Q, k, p, T, env) {
      Object.assign(Q, { armF: 1.25, elbowF: 0.5, armB: -0.6, wBlend: 1, wAngle: -0.9 + TAU * 3 * easeInOut(k), headTilt: 0.08, lean: 0.03 });
      teSet(p, 0.85 * env);
    } },
    { name: "Веер у лица", beats: 3, pose(Q, k, p, T, env) {
      const e = easeOut(clamp(k / 0.25, 0, 1)), sw = Math.sin(TAU * 2 * k) * 0.12;
      Object.assign(Q, { armF: lerp(0.8, 2.15, e), elbowF: lerp(0.6, 1.3, e), armB: lerp(-0.4, -0.9, e), wBlend: 1, wAngle: lerp(TE_REST, -1.5 + sw, e), headTilt: 0.14 * e, lean: -0.03 * e });
      teSet(p, e * env);
    } },
  ]);
  /* =====================================================================
     ФИРМЕННЫЕ СЛЕДЫ И ПОПАДАНИЯ (registerWeaponFx, 12d_kits): по следу удара видно, чем бьёт герой.
       нунчаки — электрические зигзаги вдоль дуги, восьмёрка на вихре, разряд на попадании (высокий звук);
       когти — три рваные борозды (лапы по очереди — вверх/вниз), клочья на попадании (низкий звук);
       двойная сталь — «X»: длинный разрез катаны + короткий кинжала крест-накрест;
       веер — сектор полос ветра, пыль и «листья», ветер от попадания.
     Без аллокаций в кадре; в low (g.fx.low) — вдвое меньше сегментов и без пыли.
     ===================================================================== */
  const NU_COL = "#bfe8ff", CL_COL = "#ff7a6a", TE_COL = "#c9f5dc";
  const FXP = { x: 0, y: 0 };
  const fxPoint = (cx, cy, d, r, phi, jit) => { FXP.x = cx + d * Math.cos(phi) * (r + jit); FXP.y = cy + Math.sin(phi) * (r + jit); return FXP; };
  /** Зигзаг-молния по дуге радиуса r от угла f0 до f1 (n сегментов). */
  const zigArc = (g, cx, cy, d, r, f0, f1, n, amp, col) => {
    let px = 0, py = 0;
    for (let i = 0; i <= n; i++) {
      const a = lerp(f0, f1, i / n), j = i === 0 || i === n ? 0 : (i % 2 ? amp : -amp) * (0.6 + Math.random() * 0.7);
      fxPoint(cx, cy, d, r, a, j);
      if (i) { g.fx.cut(px, py, FXP.x, FXP.y, col, 2.6, 0.17); g.fx.cut(px, py, FXP.x, FXP.y, "#ffffff", 0.9, 0.11); }
      px = FXP.x; py = FXP.y;
    }
  };
  /** Лучи-разряд от точки (хаотичные короткие ломаные). */
  const burstZig = (g, x, y, n, len, col) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, m = len * (0.6 + Math.random() * 0.5), a2 = a + (Math.random() - 0.5) * 1.2;
      const mx = x + Math.cos(a) * m * 0.55, my = y + Math.sin(a) * m * 0.55;
      g.fx.cut(x, y, mx, my, col, 2, 0.14); g.fx.cut(mx, my, mx + Math.cos(a2) * m * 0.5, my + Math.sin(a2) * m * 0.5, "#ffffff", 1, 0.12);
    }
  };
  /** Борозда когтя: ломаная из двух отрезков. */
  const gash = (g, x0, y0, x1, y1, col, w) => {
    const mx = (x0 + x1) / 2 + (Math.random() - 0.5) * 5, my = (y0 + y1) / 2 + (Math.random() - 0.5) * 5;
    g.fx.cut(x0, y0, mx, my, col, w, 0.22); g.fx.cut(mx, my, x1, y1, col, w * 0.8, 0.22);
    g.fx.cut(x0, y0, x1, y1, "#ffffff", 0.9, 0.14);
  };
  const fxRad = act => (act.def.spin ? 34 : 26) * (act.def.fxR || 1);

  registerWeaponFx("nunchaku", {
    hitRate: 1.3,
    slash(g, p, act, sub) {
      const d = act.dir, cx = p.x + d * 6, cy = p.y - 20, r = fxRad(act), n = g.fx.low ? 4 : 8;
      if (act.def.spin) {
        // восьмёрка: две петли, пересекающиеся перед героем
        const m = g.fx.low ? 8 : 14; let px = 0, py = 0;
        for (let i = 0; i <= m; i++) {
          const t = i / m * TAU, x = cx + d * r * 0.9 * Math.sin(t), y = cy + r * 0.5 * Math.sin(2 * t);
          if (i) { g.fx.cut(px, py, x, y, NU_COL, 2.6, 0.2); if (i % 2) g.fx.cut(px, py, x, y, "#ffffff", 0.9, 0.12); }
          px = x; py = y;
        }
        g.fx.glow(cx, cy, 6, r * 1.2, NU_COL, 0.16, 0.3);
        return true;
      }
      const up = sub % 2 === (act.name === "slash2" ? 0 : 1);
      zigArc(g, cx, cy, d, r * 0.95, up ? 0.9 : -2.3, up ? -2.3 : 0.9, n, r * 0.16, NU_COL);
      const e = fxPoint(cx, cy, d, r * 0.95, up ? -2.3 : 0.9, 0);
      g.fx.sparks(e.x, e.y, g.fx.low ? 2 : 5, NU_COL, 220, null, TAU, 0.2);
      return true;
    },
    thrust(g, p, act) {
      const d = act.dir, y = p.y - 20, x0 = p.x + d * 6, x1 = p.x + d * (act.def.reach + 20);
      let px = x0, py = y;
      const n = g.fx.low ? 4 : 7;
      for (let i = 1; i <= n; i++) {
        const x = lerp(x0, x1, i / n), yy = y + (i === n ? 0 : (i % 2 ? -3.2 : 3.2));
        g.fx.cut(px, py, x, yy, NU_COL, 2.6, 0.16); g.fx.cut(px, py, x, yy, "#ffffff", 0.9, 0.1); px = x; py = yy;
      }
      g.fx.glow(x1, y, 3, 18, NU_COL, 0.14, 0.45);
      return true;
    },
    hit(g, e, act, hx, hy, dirX, perfect, killed) {
      burstZig(g, hx, hy, g.fx.low ? 2 : perfect ? 5 : 3, perfect ? 26 : 18, NU_COL);
      g.fx.glow(hx, hy, 3, perfect ? 34 : 24, NU_COL, 0.14, 0.5);
    },
  });

  registerWeaponFx("claws", {
    hitRate: 0.72,
    slash(g, p, act, sub) {
      const d = act.dir, cx = p.x + d * 6, cy = p.y - 20, L = act.def.reach * 0.95 + 12;
      const rise = (sub + (act.name === "slash2" ? 1 : 0)) % 2 === 1;
      const y0 = rise ? cy + 10 : cy - 16, y1 = rise ? cy - 18 : cy + 10, n = g.fx.low ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const o = (i - (n - 1) / 2) * 5.5;
        gash(g, cx - d * (6 - Math.abs(i - 1)), y0 + o * 0.5, cx + d * (L - Math.abs(i - 1) * 3), y1 + o, CL_COL, 3.2);
      }
      if (!g.fx.low) {
        g.fx.sparks(cx + d * L, y1, 3, "#ffd0c0", 170, d > 0 ? 0 : PI, 0.8, 0.22);
        g.fx.dust(cx + d * L * 0.5, p.y - 2, 2, "#5a3a3a");
      }
      return true;
    },
    thrust(g, p, act) {
      // два быстрых тычка когтей: пара коротких борозд
      const d = act.dir, cx = p.x + d * 8, y = p.y - 20, L = act.def.reach + 8;
      gash(g, cx, y - 6, cx + d * L, y - 5, CL_COL, 2.8);
      gash(g, cx, y + 3, cx + d * (L - 4), y + 4, CL_COL, 2.8);
      return true;
    },
    hit(g, e, act, hx, hy, dirX, perfect, killed) {
      // клочья и борозды поперёк врага
      const n = g.fx.low ? 2 : 3, d = dirX >= 0 ? 1 : -1;
      for (let i = 0; i < n; i++) gash(g, hx - d * 8, hy - 9 + i * 6, hx + d * 10, hy - 3 + i * 6, CL_COL, 2.2);
      g.fx.sparks(hx, hy, g.fx.low ? 3 : perfect ? 9 : 6, "#ff9a88", 190, dirX > 0 ? 0 : PI, 1.1, 0.3);
      if (!g.fx.low) g.fx.shards(hx, hy, killed ? 5 : 2, "#7a2a2a", 150);
    },
  });

  registerWeaponFx("twinsteel", {
    hitRate: 1.12,
    slash(g, p, act, sub) {
      const d = act.dir, cx = p.x + d * 6, cy = p.y - 20, L = act.def.reach * 1.05 + 22, f = sub % 2 ? -1 : 1;
      // катана — длинный разрез сверху-сзади вниз-вперёд, кинжал — короткий встречный снизу вверх
      g.fx.cut(cx - d * 14, cy - 26 * f, cx + d * L, cy + 10 * f, p.skin.accent, 4.2, 0.2);
      g.fx.cut(cx - d * 14, cy - 26 * f, cx + d * L, cy + 10 * f, "#ffffff", 1.4, 0.13);
      const dx0 = cx + d * 2, dx1 = cx + d * L * 0.7;
      g.fx.cut(dx0, cy + 14 * f, dx1, cy - 20 * f, NU_COL, 2.6, 0.18);
      g.fx.cut(dx0, cy + 14 * f, dx1, cy - 20 * f, "#ffffff", 1, 0.12);
      const X = cx + d * L * 0.36, Y = cy - 3 * f;
      g.fx.glow(X, Y, 3, 16, "#ffffff", 0.14, 0.5);
      if (!g.fx.low) g.fx.sparks(X, Y, 4, "#ffffff", 200, null, TAU, 0.2);
      return true;
    },
    thrust(g, p, act) {
      const d = act.dir, y = p.y - 20, x0 = p.x + d * 6, x1 = p.x + d * (act.def.reach + 22);
      g.fx.cut(x0, y - 2, x1, y - 2, p.skin.accent, 3.6, 0.17); g.fx.cut(x0, y - 2, x1, y - 2, "#ffffff", 1.3, 0.11);
      g.fx.cut(x0 + d * 8, y + 6, x1 - d * 12, y - 8, NU_COL, 2.2, 0.15);
      g.fx.sparks(x1, y - 2, 4, "#ffffff", 190, d > 0 ? 0 : PI, 0.6, 0.2);
      return true;
    },
    hit(g, e, act, hx, hy, dirX, perfect, killed) {
      // «X» на враге: два росчерка крест-накрест
      const s = perfect ? 15 : 11;
      g.fx.cut(hx - s, hy - s * 0.8, hx + s, hy + s * 0.8, "#ffffff", 2.2, 0.2);
      g.fx.cut(hx - s, hy + s * 0.8, hx + s, hy - s * 0.8, NU_COL, 2.2, 0.2);
      g.fx.glow(hx, hy, 2, 14, "#ffffff", 0.12, 0.5);
    },
  });

  registerWeaponFx("tessen", {
    hitRate: 0.95,
    slash(g, p, act, sub) {
      const d = act.dir, cx = p.x + d * 6, cy = p.y - 20, r = fxRad(act), n = g.fx.low ? 3 : 6, col = p.skin.accent;
      const up = sub % 2 === (act.name === "slash2" ? 0 : 1), f0 = up ? 0.8 : -2.1, f1 = up ? -2.1 : 0.8;
      // сектор раскрытого веера: полосы-спицы
      for (let i = 0; i < n; i++) {
        const a = lerp(f0, f1, i / (n - 1)), c = Math.cos(a), s = Math.sin(a);
        g.fx.cut(cx + d * c * r * 0.3, cy + s * r * 0.3, cx + d * c * r * 1.25, cy + s * r * 1.25, i % 2 ? TE_COL : col, 3, 0.2);
      }
      g.fx.glow(cx, cy, 4, 22, TE_COL, 0.14, 0.4);      // вспышка раскрытия
      if (!g.fx.low) g.fx.dust(cx + d * r, cy + 6, 3, "#8fb8a4");
      return true;
    },
    thrust(g, p, act) {
      const d = act.dir, y = p.y - 20, x0 = p.x + d * 6, L = act.def.reach + 14;
      for (let i = -1; i <= 1; i++) g.fx.cut(x0, y, x0 + d * L, y + i * 7, i ? TE_COL : p.skin.accent, i ? 2.2 : 3.2, 0.16);
      g.fx.sparks(x0 + d * L, y, 3, TE_COL, 170, d > 0 ? 0 : PI, 0.7, 0.22);
      return true;
    },
    hit(g, e, act, hx, hy, dirX, perfect, killed) {
      // ветер от попадания: полосы по направлению удара, пыль и «листья»
      const d = dirX >= 0 ? 1 : -1;
      for (let i = -1; i <= 1; i++) g.fx.line(hx, hy + i * 6, hx + d * (20 + (i ? 0 : 8)), hy + i * 8, TE_COL, 2, 0.2);
      if (!g.fx.low) { g.fx.dust(hx, hy, 3, "#8fb8a4"); g.fx.shards(hx, hy, perfect ? 4 : 2, "#7fd6a8", 140); }
    },
  });
}
