/* =====================================================================
   Огнестрел, часть 3 (по просьбе «снайперская винтовка, помимо моих примеров добавь какие-нибудь от себя»):
   «Дальнобойная винтовка» (sniper), «Тихий арбалет» (crossbow), «Ручной гранатомёт» (launcher).
   Для каждого: оружие в WEAPONS (Арсенал), отрисовка WEAPON_DRAW, позы всех выстрелов (kit.pose), две комбинации
   (moves + choose), своё добивание (registerTakedown). Всё в блоке {} — локальные имена с префиксом kf.

   Комбинации (имя в ATTACKS → подпись):
     sniperHead    «В голову»         — точный выстрел на сильную долю издалека: прицеливание лазером, мгновенный луч в голову (крит), пробивает
     sniperBolt    «Затвор»           — «и» сразу после выстрела: передёрнули затвор, быстрый второй выстрел навылет
     xbowNail      «Пригвождение»     — точное нажатие на сильную долю: тяжёлый болт навылет, пригвождает всех на линии на две доли
     xbowHail      «Град болтов»      — сильная доля + грув ≥ 2 + двое и больше врагов: пять болтов взлетают дугой и падают на врагов сверху
     launchCascade «Каскад»           — сильная доля + грув ≥ 1 издалека: три гранаты шагают к врагу, взрываются цепочкой на четвертях доли
     launchBlast   «Взрыв под ногами» — враг вплотную при отходе: граната под ноги, герой отпрыгивает, взрыв на доле подбрасывает врагов
   Механики:
     • Дальнобойная винтовка — выстрел с колена, лазерная подсказка на прицеливании, пуля навылет, долгое восстановление (затвор).
     • Тихий арбалет — болт летит дугой и пригвождает врага к полу до ближайшей доли (поле e.kfPin, снимается обёрткой update).
     • Ручной гранатомёт — граната по дуге, взрыв по площади ровно на следующей доле (список cs.kfGren, зона взрыва показана на земле).
   Точки расширения в чужих файлах: 12_combat — b.grav (снаряд по дуге) и b.draw (своя отрисовка снаряда) в цикле снарядов.
   ===================================================================== */
{
  const KF_HALF = Math.PI / 2;
  const WD_LN = [10.4, 13.4, 16];       // кольца на стволе гранатомёта

  /* ---------- оружие (Арсенал) ----------
     Урон за нажатие × скорость ≈ пистолету ±10–15%: винтовка — редкие тяжёлые выстрелы, арбалет — средний урон + оглушение
     пригвождением, гранатомёт — слабее по одной цели (взрыв с задержкой), но бьёт по площади. */
  WEAPONS.sniper = {
    slot: "gun", name: "Дальнобойная винтовка", info: "Лазерный прицел и пуля навылет: бьёт очень далеко, но заряжается долго.", stats: [5, 1, 5],
    mod: { dmg: 1.8, st: 1.75, rc: 1.9, speed: 1.5, knock: 1.6, stun: 1.3, pierce: true, pr: 7, life: 1.8, muzzle: 28, recoil: 40 },
  };
  WEAPONS.crossbow = {
    slot: "gun", name: "Тихий арбалет", info: "Болт летит дугой и пригвождает врага к полу до ближайшей доли.", stats: [3, 2, 3],
    mod: { dmg: 1.45, st: 1.15, rc: 1.55, speed: 0.85, knock: 0.3, stun: 0.6, pr: 3.2, life: 1.2, muzzle: 15 },
  };
  WEAPONS.launcher = {
    slot: "gun", name: "Ручной гранатомёт", info: "Граната по дуге: взрыв по площади ровно на следующей доле.", stats: [3, 2, 4],
    mod: { dmg: 1.4, st: 1.25, rc: 1.65, speed: 1, knock: 1.5, stun: 1.0, muzzle: 15 },
  };
  for (const id of ["sniper", "crossbow", "launcher"]) { WEAPONS[id].id = id; WEAPONS[id]._defs = {}; }

  /* ---------- помощники ---------- */
  const kfSince = (cs, key) => cs.time - (cs[key] === undefined ? -9 : cs[key]);
  /** Угол прицеливания на цель (0 — горизонтально, + вниз). У гранатомёта и «Града болтов» — навесной. */
  const kfAim = (act, p) => {
    const tg = act.target, n = act.name, w = act.def.w && act.def.w.id;
    if (n === "xbowHail") return -0.95;
    if (w === "launcher") {
      if (n === "launchBlast") return 0.95;
      return -clamp((tg ? Math.abs(tg.x - p.x) : 260) / 800, 0.22, 0.6);
    }
    return tg ? Math.atan2(tg.centerY - (p.y - 20), Math.abs(tg.x - p.x)) : 0;
  };
  /** Отдача 0..1 от момента выстрела (act.kfAt у своих приёмов, иначе момент выстрела встроенной механики). */
  const kfKick = (act, dur) => {
    const t0 = act.kfAt != null ? act.kfAt : act.startup + (act.def.fireAt || 0);
    if (act.t < t0) return 0;
    return Math.max(0, 1 - (act.t - t0) / dur);
  };
  /** Ход перезарядки 0..1 на восстановлении (с долей `from` до конца). */
  const kfReload = (act, k, from = 0.12, span = 0.7) => act.phase === "recovery" ? clamp((k.r - from) / span, 0, 1) : 0;
  /** Конец луча из (x, y) по (dx, dy) до края арены. */
  const kfBeamEnd = (x, y, dx, dy) => {
    const lim = dx > 0 ? (WORLD.w + 40 - x) / Math.max(dx, 1e-3) : (-40 - x) / Math.min(dx, -1e-3);
    const t = Math.min(lim, 2400);
    return { x: x + dx * t, y: y + dy * t, t };
  };
  const kfAhead = (g, p, s) => g.enemies.filter(e => e.targetable && sign(e.x - p.x) === s && Math.abs(e.x - p.x) < 560 && Math.abs(e.centerY - p.centerY) < 200)
    .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
  const kfIsGun = n => { const a = ATTACKS[n]; return !!a && (a.kind === "ranged" || (a.kit && WEAPONS[a.kit].slot === "gun")); };
  /** Тонкий трассер из точки в точку: цветной контур, белая сердцевина. */
  const kfTracer = (g, api, hx, hy, tx, ty, w) => {
    g.fx.cut(hx, hy, tx, ty, api.col, w * 2.2, api.life(0.16));
    g.fx.cut(hx, hy, tx, ty, "#ffffff", w * 0.8, api.life(0.12));
    if (!api.low) g.fx.glow(hx, hy, 2, 6 + w * 4, "#ffffff", api.life(0.1), 0.5);
  };

  /* =====================================================================
     ОТРИСОВКА В РУКЕ
     ===================================================================== */
  WEAPON_DRAW.sniper = {
    off: 0,
    draw(ctx, ch, p, accent, hq) {
      // приклад с «щекой», ствольная коробка, рукоять
      ctx.fillStyle = "#101117";
      ctx.beginPath(); ctx.moveTo(-9.5, -1.6); ctx.lineTo(-3, -1.9); ctx.lineTo(-3, 1.5); ctx.lineTo(-5.4, 1.9); ctx.lineTo(-9.5, 2.5); ctx.closePath(); ctx.fill();
      ctx.fillRect(-3.2, -2, 9, 3.4);
      ctx.fillRect(-0.6, 1.2, 1.8, 3.6);
      // цевьё, длинный ствол, дульный тормоз
      ctx.fillStyle = "#1a1b22"; ctx.fillRect(5.8, -1.5, 8.4, 2.2); ctx.fillRect(14.2, -1, 10, 1);
      ctx.fillStyle = "#101117"; ctx.fillRect(23.4, -1.5, 2.4, 1.9);
      ctx.fillStyle = accent; ctx.fillRect(25, -1.4, 0.7, 1.7);
      // сошки
      ctx.strokeStyle = "#2a2c38"; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(10, 0.7); ctx.lineTo(8.4, 4); ctx.moveTo(10, 0.7); ctx.lineTo(11.6, 4); ctx.stroke();
      // оптика на двух кронштейнах: линзы горят неоном
      ctx.fillStyle = "#16171d"; ctx.fillRect(1.2, -3.9, 1.6, 2); ctx.fillRect(9, -3.9, 1.6, 2);
      ctx.fillRect(-0.4, -5.9, 14, 2.3);
      ctx.fillStyle = "#0d0e12"; ctx.fillRect(-1.4, -6.4, 2, 3.3); ctx.fillRect(12.4, -6.6, 2.4, 3.7);
      ctx.fillStyle = accent; ctx.fillRect(14.3, -5.5, 0.7, 2.6); ctx.fillRect(2.6, -5.2, 6, 0.4);
      ctx.fillStyle = rgba(accent, 0.55); ctx.fillRect(-2.4, -2.4, 6, 0.45);
      if (hq) { ctx.globalAlpha *= 0.4; ctx.fillStyle = accent; ctx.fillRect(14.1, -5.8, 1.1, 3.2); ctx.globalAlpha /= 0.4; }
      // лазерная подсказка: тонкий луч вдоль ствола до цели и точка на ней (метка свежая — иначе забытое значение не светит)
      const a = ch.snLaser;
      if (a && performance.now() - ch.snAt < 160) {
        const col = ch.snHead ? "#ff4a5e" : accent, L = Math.max(40, (ch.snDist != null ? ch.snDist : 600) / (ch.scale || 1));
        ctx.save();
        ctx.beginPath(); ctx.moveTo(25.8, -0.5); ctx.lineTo(25.8 + L, -0.5);
        if (hq) { ctx.globalAlpha = 0.16 * a; ctx.lineWidth = 2.2; ctx.strokeStyle = col; ctx.stroke(); }
        ctx.globalAlpha = 0.7 * a; ctx.lineWidth = 0.45; ctx.strokeStyle = col; ctx.stroke();
        ctx.globalAlpha = a; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(25.8 + L, -0.5, 1.5, 0, TAU); ctx.fill();
        ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(25.8 + L, -0.5, 0.6, 0, TAU); ctx.fill();
        ctx.restore();
      }
    },
  };

  WEAPON_DRAW.crossbow = {
    off: 0,
    draw(ctx, ch, p, accent, hq) {
      // состояние тетивы/болта задаёт поза (метка свежая — иначе арбалет взведён и заряжён)
      const fresh = performance.now() - (ch.xbAt || 0) < 200, cock = fresh ? ch.xbCock : 1, load = fresh ? ch.xbLoad : 1;
      // ложе с ложей для болта, рукоять, спусковая скоба
      ctx.fillStyle = "#14151b";
      ctx.beginPath(); ctx.moveTo(-8, -1); ctx.lineTo(-2, -1.5); ctx.lineTo(15, -1.5); ctx.lineTo(15, 0.8); ctx.lineTo(0.8, 1.1); ctx.lineTo(-0.8, 4.6); ctx.lineTo(-3, 4.6); ctx.lineTo(-3.3, 1.7); ctx.lineTo(-8, 2.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = rgba(accent, 0.6); ctx.fillRect(-1, -1.9, 15, 0.4);
      ctx.fillStyle = "#1c1d25"; ctx.fillRect(5, -2.9, 1, 1.4); ctx.fillRect(8.4, -2.9, 1, 1.4);        // целик и мушка
      // плечи: две дуги по обе стороны ложа, изогнутые вперёд
      ctx.beginPath();
      ctx.moveTo(14, -9.2); ctx.quadraticCurveTo(19.8, -4.4, 16.4, -0.3); ctx.quadraticCurveTo(19.8, 4.4, 14, 8.8);
      ctx.lineTo(12.9, 8.8); ctx.quadraticCurveTo(16.2, 4.4, 14.3, -0.3); ctx.quadraticCurveTo(16.2, -4.4, 12.9, -9.2); ctx.closePath();
      ctx.fillStyle = "#1c1d25"; ctx.fill();
      ctx.beginPath(); ctx.moveTo(14, -9.2); ctx.quadraticCurveTo(19.8, -4.4, 16.4, -0.3); ctx.quadraticCurveTo(19.8, 4.4, 14, 8.8);
      wGlow(ctx, hq, 3, accent, 0.35);
      ctx.strokeStyle = accent; ctx.lineWidth = 0.7; ctx.stroke();
      // тетива: от концов плеч к ушку; взведённая — оттянута к спуску
      const nx = lerp(14.8, 5, cock);
      ctx.strokeStyle = "#c9cfdd"; ctx.lineWidth = 0.4;
      ctx.beginPath(); ctx.moveTo(13.2, -9.1); ctx.lineTo(nx, -0.6); ctx.lineTo(13.2, 8.7); ctx.stroke();
      // болт на направляющей
      if (load > 0.5) {
        ctx.strokeStyle = "#8a90a2"; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(nx - 0.5, -0.6); ctx.lineTo(nx + 17, -0.6); ctx.stroke();
        ctx.fillStyle = accent; ctx.beginPath(); ctx.moveTo(nx + 17, -1.5); ctx.lineTo(nx + 20, -0.6); ctx.lineTo(nx + 17, 0.3); ctx.fill();
        ctx.fillStyle = rgba(accent, 0.7); ctx.fillRect(nx - 0.5, -1.4, 2, 0.5); ctx.fillRect(nx - 0.5, 0.2, 2, 0.5);
      }
      // стремя на конце ложа
      ctx.strokeStyle = "#2a2c38"; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(17.6, 0.2, 1.7, 0, TAU); ctx.stroke();
    },
  };

  WEAPON_DRAW.launcher = {
    off: 0,
    draw(ctx, ch, p, accent, hq) {
      const fresh = performance.now() - (ch.lnAt || 0) < 200, open = fresh ? ch.lnOpen : 0;
      // рамка с рукоятью
      ctx.fillStyle = "#101117";
      ctx.beginPath(); ctx.moveTo(-4.6, -1.8); ctx.lineTo(8.6, -2.4); ctx.lineTo(8.6, 1.4); ctx.lineTo(2.4, 1.8); ctx.lineTo(0.9, 5.8); ctx.lineTo(-1.9, 5.6); ctx.lineTo(-1.5, 1.8); ctx.lineTo(-4.6, 1); ctx.closePath(); ctx.fill();
      // толстый ствол-труба со светлой кромкой и раструбом
      ctx.fillStyle = "#262833"; ctx.fillRect(7.4, -3.6, 11, 4.6);
      ctx.fillStyle = "#14151b"; ctx.fillRect(7.4, 0.2, 11, 0.8);
      ctx.fillStyle = rgba(accent, 0.8); ctx.fillRect(7.4, -3.6, 11, 0.5);
      ctx.fillStyle = "#101117"; ctx.fillRect(17.4, -4.2, 2.8, 5.8);
      ctx.fillStyle = "#050507"; ctx.fillRect(19.4, -2.9, 0.8, 3);
      ctx.fillStyle = accent; ctx.fillRect(18.3, -4.2, 0.6, 5.8);
      for (const x of WD_LN) ctx.fillRect(x, -3.6, 0.5, 4.6);
      // барабан: при перезарядке откидывается вниз, над ним видна граната
      ctx.save(); ctx.translate(0, open * 3.4);
      ctx.beginPath(); ctx.arc(5, -1.1, 3, 0, TAU); ctx.fillStyle = "#1c1d25"; ctx.fill();
      ctx.beginPath(); ctx.arc(5, -1.1, 3, Math.PI * 0.9, Math.PI * 1.9); ctx.strokeStyle = accent; ctx.lineWidth = 0.6; ctx.stroke();
      ctx.fillStyle = "#050507";
      for (let i = 0; i < 4; i++) { const a = i * KF_HALF + 0.4; ctx.beginPath(); ctx.arc(5 + Math.cos(a) * 1.6, -1.1 + Math.sin(a) * 1.6, 0.6, 0, TAU); ctx.fill(); }
      ctx.restore();
      if (open > 0.3) {
        ctx.fillStyle = "#262833"; ctx.beginPath(); ctx.arc(5, -6.4 - open * 1.2, 1.9, 0, TAU); ctx.fill();
        ctx.strokeStyle = accent; ctx.lineWidth = 0.5; ctx.stroke();
      }
      // передняя рукоять, прицельная планка
      ctx.fillStyle = "#1c1d25"; ctx.fillRect(12, 0.8, 1.9, 4.2);
      ctx.fillStyle = rgba(accent, 0.6); ctx.fillRect(-1, -2.2, 7, 0.45);
      ctx.fillStyle = "#14151b"; ctx.fillRect(14.5, -4.9, 0.6, 1.5); ctx.fillRect(9, -4.4, 0.6, 1);
    },
  };

  /* =====================================================================
     ДАЛЬНОБОЙНАЯ ВИНТОВКА
     ===================================================================== */
  const snPose = (P, act, p, k) => {
    const def = act.def;
    if (def.kind !== "ranged" && def.kind !== "custom") return;
    const ang = kfAim(act, p), aim = KF_HALF - ang, t = act.t;
    const quick = act.name === "sniperBolt", head = act.name === "sniperHead";
    const kick = kfKick(act, 0.42);
    const charge = act.phase === "startup" ? k.s : 0;
    // с колена: винтовка у плеча, щека на прикладе, задняя рука на цевье; чем ближе выстрел, тем неподвижнее
    const sh = easeOut(clamp(t / Math.max(0.03, act.startup * 0.55), 0, 1));
    const lean = (quick ? 0.16 : 0.1) - kick * 0.3;
    P.armF = lerp(0.4, aim - 0.7, sh); P.elbowF = lerp(0.15, 1.5, sh); P.armB = lerp(-0.4, aim - 0.38, sh);
    P.wBlend = sh; P.wAngle = lerp(0.6, ang - lean, sh);
    P.lean = lean; P.legSpread = 2.15;
    P.bodyY = (quick ? 2.6 : 4.6) * sh + Math.sin(t * 150) * 0.15 * charge * charge * (head ? 1.6 : 0.8) + kick * 1.5;
    P.sy = 1 - 0.08 * sh; P.sx = 1.04 - kick * 0.07;
    P.headTilt = -0.12 - kick * 0.2; P.cloak = -kick * 1.2;
    // затвор на восстановлении: рука поднимается к рукояти, рывок назад, возврат вперёд, опускается (долго: это цена мощи)
    if (act.phase === "recovery") {
      const u = kfReload(act, k, quick ? 0.1 : 0.14, quick ? 0.8 : 0.72);
      const lift = easeInOut(clamp(u / 0.2, 0, 1)) - easeInOut(clamp((u - 0.82) / 0.18, 0, 1));
      const pull = easeOut(clamp((u - 0.2) / 0.28, 0, 1)) - easeInOut(clamp((u - 0.62) / 0.2, 0, 1));
      P.armB += 0.42 * lift - 0.62 * pull;
      P.armF += 0.1 * lift; P.headTilt = lerp(P.headTilt, 0.04, lift); P.bodyY -= 0.5 * lift;
    }
    // лазерная подсказка на прицеливании и в момент выстрела; у «В голову» — красная и ярче
    p.snLaser = act.phase === "startup" ? (quick ? 0 : 0.3 + 0.7 * k.s) : act.phase === "active" ? 1 : Math.max(0, 1 - k.r * 5);
    p.snHead = head ? 1 : 0;
    p.snDist = act.target ? Math.max(40, Math.abs(act.target.x - p.x) - 26) : 600;
    p.snAt = performance.now();
  };

  /** Мгновенный луч «В голову» из дула: попадание по всем на линии, прицельный враг получает крит. */
  const kfSnipe = (cs, p, act) => {
    const g = cs.game, col = p.skin.accent, low = g.fx.low;
    const tg = act.target && act.target.targetable ? act.target : null;
    const h = CharacterRenderer.handWorld(p, 28);
    const ty = tg ? tg.y - tg.h * tg.scale * 0.86 : h.y, tx = tg ? tg.x : h.x + act.dir * 400;
    const ang = Math.atan2(ty - h.y, tx - h.x), dx = Math.cos(ang), dy = Math.sin(ang), end = kfBeamEnd(h.x, h.y, dx, dy);
    const hits = [], tLen = tg ? Math.hypot(tx - h.x, ty - h.y) : 0;
    for (const e of g.enemies) {
      if (!e.targetable) continue;
      const box = { x: e.x - e.w * e.scale / 2 - 3, y: e.y - e.h * e.scale - 3, w: e.w * e.scale + 6, h: e.h * e.scale + 6 };
      let t = rayBox(h.x, h.y, dx, dy, box);
      // за прицельным врагом пуля идёт по уровню его корпуса — достаёт всех на линии, а не уходит выше голов
      if (tg && e !== tg && (e.x - tg.x) * dx > 0) { const t2 = rayBox(tg.x, tg.centerY, sign(dx), 0, box); t = t2 >= 0 ? tLen + t2 : -1; }
      if (t >= 0 && t <= end.t) hits.push({ e, t });
    }
    hits.sort((a, b) => a.t - b.t);
    // тонкая белая нить с цветным ореолом и вспышка у дула
    g.fx.line(h.x, h.y, end.x, end.y, col, 4.2, 0.12);
    g.fx.line(h.x, h.y, end.x, end.y, "#ffffff", 1.2, 0.2);
    g.fx.sparks(h.x, h.y, 6, "#ffffff", 260, ang, 0.35, 0.14);
    if (!low) g.fx.glow(h.x, h.y, 3, 24, "#ffffff", 0.14, 0.55);
    g.fx.ring(h.x, h.y, 2, 16, col, 0.2, 2);
    g.camera.shake(0.24); g.camera.kick(0.03);
    for (const { e, t } of hits) {
      const crit = e === tg, px = crit || !tg ? h.x + dx * t : e.x, py = crit || !tg ? h.y + dy * t : tg.centerY;
      act.dmgK = crit ? 1 : 0.55;
      cs._applyHit(e, act, sign(dx) || act.dir, px, py);
      if (crit) {
        g.fx.ring(px, ty, 3, 34, "#ff4a5e", 0.3, 2.4);
        g.fx.ring(px, ty, 2, 20, "#ffffff", 0.2, 1.6);
        if (!low) g.fx.glow(px, ty, 4, 34, "#ffffff", 0.14, 0.6);
      }
    }
    act.dmgK = 1;
    p.vx -= act.dir * 70;
    g.fx.dust(p.x - act.dir * 4, p.y, low ? 2 : 4);
    return hits.length;
  };

  registerKit("sniper", {
    pose: snPose,
    moves: {
      sniperHead: {
        kind: "custom", startup: 0.24, active: 0.04, recovery: 0.46, cancel: 0.5, dmg: 28, knock: 360, stun: 0.6, moveControl: 0.05, name: "В голову",
        update(cs, p, act, dt) {
          const g = cs.game;
          if (!act.kfInit) { act.kfInit = true; cs.kfHeadT = cs.time; p.pistolT = 0.9; g.sfxAt(act.impactSong, "shot", true); g.sfx("combo", 1.4); }
          if (act.phase === "startup") p.vx = damp(p.vx, 0, 14, dt);
          if (act.t >= act.startup && !act.kfFired) { act.kfFired = true; act.kfAt = act.t; kfSnipe(cs, p, act); }
        },
      },
      sniperBolt: {
        kind: "ranged", startup: 0.03, active: 0.02, recovery: 0.28, cancel: 0.2, dmg: 20, speed: 1400, knock: 200, stun: 0.3, pierce: true, pr: 6.5, life: 1.6,
        muzzle: 28, recoil: 30, moveControl: 0.25, name: "Затвор",
        update(cs, p, act) {
          if (!act.kfInit) { act.kfInit = true; cs.kfBoltT = cs.time; p.pistolT = 0.9; }
        },
      },
    },
    choose(cs, name, c) {
      if (c.air || !c.target) return;
      // выстрел точно на сильную долю издалека → в голову
      if (c.j.rating === "perfect" && c.j.strong && c.dx >= 110 && name !== "backShot" && kfSince(cs, "kfHeadT") > 1.2) return "sniperHead";
      // «и» сразу после выстрела → передёрнули затвор и стреляем снова
      if (c.j.offbeat && cs.lastAction && kfIsGun(cs.lastAction) && cs.time - cs.lastActionT < 0.6 && kfSince(cs, "kfBoltT") > 0.4) return "sniperBolt";
    },
    takedown(cs, kind) { return kind === "colossus" ? null : "sniperShot"; },
  });

  // «ОДИН ВЫСТРЕЛ»: лазерная точка ползёт от ног к голове, прицельная сетка сходится, выстрел — враг падает навзничь
  const SN_FIRE = 0.8;
  registerTakedown("sniperShot", {
    name: "ОДИН ВЫСТРЕЛ", dur: 1.35, death: "shot",
    update(cs, td, api) {
      const g = cs.game, p = g.player, e = td.e, t = api.t, d = td.dir, col = api.col;
      p.pistolT = 0.9; p.y = td.py; p.facing = d;
      p.x = t < SN_FIRE ? td.px : td.px - d * 9 * easeOut((t - SN_FIRE) / 0.16);
      if (td.z0 === undefined) td.z0 = g.camera.fz;
      const hy = e.y - e.h * e.scale * 0.86, ecy = e.y - e.h * e.scale * 0.5;
      g.camera.retarget(lerp(p.x, e.x, 0.6), ecy - 6, Math.min(1.75, td.z0 * (1 + 0.22 * easeInOut(clamp(t / SN_FIRE, 0, 1)))));
      if (t < SN_FIRE) {
        e.tdPose = { lean: -0.08, armF: -0.6, armB: -0.9, bodyY: 1.2, headTilt: -0.1 };
        // лазерная точка: от ног к голове, затем держится на лбу
        const u = easeInOut(clamp((t - 0.1) / 0.5, 0, 1)), dy = lerp(e.y - 2, hy, u);
        const h = CharacterRenderer.handWorld(p, 28);
        if (t > 0.1) {
          g.fx.line(h.x, h.y, e.x, dy, t > 0.62 ? "#ff4a5e" : col, 0.8, api.life(0.05));
          if (!api.low) g.fx.glow(e.x, dy, 1.5, 5, t > 0.62 ? "#ff4a5e" : "#ffffff", api.life(0.05), 0.8);
        }
        // прицельная сетка: четыре чёрточки вокруг головы сжимаются к цели
        if (t > 0.34) {
          const r = lerp(30, 9, easeOut((t - 0.34) / 0.4)), a = api.life(0.05);
          g.fx.line(e.x - r, hy, e.x - r + 8, hy, "#ffffff", 0.8, a); g.fx.line(e.x + r, hy, e.x + r - 8, hy, "#ffffff", 0.8, a);
          g.fx.line(e.x, hy - r, e.x, hy - r + 8, "#ffffff", 0.8, a); g.fx.line(e.x, hy + r, e.x, hy + r - 8, "#ffffff", 0.8, a);
        }
      }
      api.once("lock", 0.62, () => { g.fx.ring(e.x, hy, 34, 8, "#ff4a5e", api.life(0.22), 1.4); g.sfx("combo", 2); });
      api.once("fire", SN_FIRE, () => {
        const h = CharacterRenderer.handWorld(p, 28);
        const dx = e.x - h.x, dy = hy - h.y, l = Math.hypot(dx, dy) || 1, end = kfBeamEnd(h.x, h.y, dx / l, dy / l);
        g.fx.line(h.x, h.y, end.x, end.y, col, 8, api.life(0.14));
        g.fx.line(h.x, h.y, end.x, end.y, "#ffffff", 1.8, api.life(0.3));
        if (!api.low) { g.fx.glow(h.x, h.y, 5, 30, "#ffffff", api.life(0.16), 0.6); g.fx.glow(e.x, hy, 6, 40, "#ffffff", api.life(0.16), 0.7); }
        g.fx.ring(h.x, h.y, 3, 22, col, api.life(0.24), 2);
        g.fx.ring(e.x, hy, 4, 44, "#ff4a5e", api.life(0.32), 2.4);
        g.fx.sparks(e.x, hy, 7, "#ffffff", 240, d > 0 ? 0 : Math.PI, 1.0, 0.22);
        g.fx.dust(p.x - d * 4, p.y, api.low ? 3 : 6);
        g.sfx("shot", true); g.sfx("bulletHit"); g.sfx("slam");
        g.camera.shake(0.3); g.camera.kick(0.04);
        e.flash = 0.7; e.hitKick = 1;
        api.finish();
      });
      // гильза и дымок
      api.once("case", SN_FIRE + 0.34, () => {
        const h = CharacterRenderer.handWorld(p, 4);
        g.fx.shards(h.x, h.y, 2, "#d9b54a", 90); g.sfx("step");
        if (!api.low) g.fx.glow(h.x + d * 22, h.y - 1, 3, 12, "#8892a6", api.life(0.4), 0.22);
      });
    },
    pose(cs, p, td) {
      const t = td.t, e = td.e, ph = (a, b) => clamp((t - a) / (b - a), 0, 1);
      const ang = Math.atan2(e.y - e.h * e.scale * 0.86 - (p.y - 20), Math.abs(e.x - p.x)), aim = KF_HALF - ang;
      const sh = easeOut(ph(0, 0.14)), kick = t >= SN_FIRE ? Math.max(0, 1 - (t - SN_FIRE) / 0.34) : 0;
      const charge = t < SN_FIRE ? ph(0.1, SN_FIRE) : 0, lean = 0.1 - kick * 0.32;
      const P = {
        armF: lerp(0.4, aim - 0.7, sh), elbowF: lerp(0.15, 1.5, sh), armB: lerp(-0.4, aim - 0.38, sh), wBlend: sh, wAngle: lerp(0.6, ang - lean, sh),
        lean, legSpread: 2.15, sy: 1 - 0.08 * sh, sx: 1.04 - kick * 0.07, bodyY: 4.6 * sh + Math.sin(t * 150) * 0.2 * charge * charge + kick * 1.7,
        headTilt: -0.12 - kick * 0.2, cloak: -kick * 1.2,
      };
      if (t >= SN_FIRE + 0.16) {         // затвор: рука к рукояти, рывок назад и вперёд
        const u = ph(SN_FIRE + 0.16, SN_FIRE + 0.62), lift = Math.sin(Math.PI * clamp(u * 1.3, 0, 1)), pull = Math.sin(Math.PI * clamp((u - 0.2) / 0.6, 0, 1));
        P.armB += 0.42 * lift - 0.62 * pull; P.armF += 0.1 * lift; P.headTilt = lerp(P.headTilt, 0.04, lift);
      }
      if (t > 1.15) { const kk = easeInOut(ph(1.15, 1.35)); P.armF = lerp(P.armF, 0.9, kk); P.elbowF = lerp(P.elbowF, 0.3, kk); P.wBlend = lerp(P.wBlend, 0, kk); P.armB = lerp(P.armB, 0.2, kk); P.bodyY = lerp(P.bodyY, 0.6, kk); P.legSpread = lerp(2.15, 1.2, kk); P.sy = lerp(P.sy, 1, kk); }
      p.snLaser = t < SN_FIRE ? (t > 0.1 ? 1 : 0) : 0; p.snHead = t > 0.62 ? 1 : 0; p.snDist = Math.max(40, Math.abs(e.x - p.x) - 26); p.snAt = performance.now();
      return P;
    },
  });

  /* =====================================================================
     ТИХИЙ АРБАЛЕТ
     ===================================================================== */
  const XB_G = 220;             // «падение» болта обычных выстрелов (добавляется compensация прицела)
  const xbPose = (P, act, p, k) => {
    const def = act.def;
    if (def.kind !== "ranged" && def.kind !== "custom") return;
    const ang = kfAim(act, p), aim = KF_HALF - ang, t = act.t;
    const hail = act.name === "xbowHail", nail = act.name === "xbowNail";
    const kick = kfKick(act, 0.2);
    const ready = easeOut(clamp(t / Math.max(0.025, act.startup), 0, 1));
    // хват двумя руками низко у пояса: передняя держит ложе под плечами, задняя — на рукояти; отдача мягкая («тихий»)
    P.armF = lerp(0.35, aim, ready) - kick * 0.1; P.elbowF = 0; P.armB = lerp(-0.45, aim - 0.26, ready) + kick * 0.08;
    P.lean = (hail ? -0.14 : 0.06) - kick * 0.05; P.bodyY = 1.8 + kick * 0.5 + (nail ? 0.8 * ready : 0); P.legSpread = hail ? 1.9 : 1.7; P.sx = 1.02; P.headTilt = hail ? -0.28 : -0.08; P.wBlend = 0;
    if (def.hip) { P.armF = lerp(0.2, aim + 0.2, ready) - kick * 0.12; P.armB = -0.5; P.lean = 0.16; P.bodyY = 2; P.headTilt = 0.08; }
    // взвод рычагом на восстановлении: тетива оттягивается, на конце — новый болт
    const u = kfReload(act, k, 0.1, 0.75), lever = Math.sin(Math.PI * clamp(u / 0.85, 0, 1));
    if (act.phase === "recovery") {
      P.armB = lerp(P.armB, P.armB - 1.1, lever); P.armF = lerp(P.armF, aim + 0.12, lever * 0.5);
      P.bodyY += 0.6 * lever; P.headTilt = lerp(P.headTilt, 0.1, lever);
    }
    const fired = act.phase !== "startup";
    p.xbCock = fired ? (act.phase === "recovery" ? clamp((u - 0.1) / 0.6, 0, 1) : 0) : 1;
    p.xbLoad = fired ? (act.phase === "recovery" && u > 0.82 ? 1 : 0) : 1;
    p.xbAt = performance.now();
  };

  /** Болт в полёте: древко с оперением и наконечником; летит по дуге (b.grav). */
  const kfBoltDraw = (ctx, b, hq) => {
    const a = Math.atan2(b.vy, b.vx), c = Math.cos(a), s = Math.sin(a), L = 17;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(b.x - c * L, b.y - s * L); ctx.lineTo(b.x, b.y);
    if (hq) { ctx.strokeStyle = rgba(b.color, 0.3); ctx.lineWidth = b.r * 1.5; ctx.stroke(); }
    ctx.strokeStyle = "#cfd3e0"; ctx.lineWidth = 1.1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(b.x - c * L, b.y - s * L); ctx.lineTo(b.x - c * (L - 4), b.y - s * (L - 4));
    ctx.strokeStyle = b.color; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.fillStyle = b.color; ctx.beginPath(); ctx.moveTo(b.x + c * 3, b.y + s * 3); ctx.lineTo(b.x - c * 1.5 - s * 1.7, b.y - s * 1.5 + c * 1.7); ctx.lineTo(b.x - c * 1.5 + s * 1.7, b.y - s * 1.5 - c * 1.7); ctx.fill();
  };

  /** Пригвоздить: враг держится на месте и прижат к полу до ближайшей доли (pinBeats долей), болт торчит из него. */
  const kfPin = (cs, e, act, hx, hy, dirX) => {
    const g = cs.game, beats = act.def.pinBeats || 1;
    if (e.state === "attack" || !e.alive || e.executed) return;
    let tb = g.clock.nextBeatAfter(g.songNow, 0.14);
    for (let i = 1; i < beats; i++) tb = g.clock.nextBeatAfter(tb, 0.05);
    let dur = clamp(tb - g.songNow, 0.2, 1.5);
    if (e.kind === "brute") dur *= 0.5;
    e.kfPin = dur; e.kfPinMax = dur;
    e.kfBolt = { ox: hx - e.x, oy: hy - e.y, a: dirX > 0 ? 0.35 : Math.PI - 0.35 };
    e.cancelAttack(g); e.setState("hurt"); e.hurtDur = dur + 0.1;
    e.vx = 0; e.vy = e.onGround ? 0 : 320;
    g.fx.ring(e.x, e.y - 3, 3, 20, g.player.skin.accent, 0.22, 1.6);
    g.fx.sparks(hx, hy, 4, "#ffffff", 140, null, Math.PI, 0.18);
  };

  registerKit("crossbow", {
    pose: xbPose,
    moves: {
      xbowNail: {
        kind: "ranged", startup: 0.1, active: 0.02, recovery: 0.4, cancel: 0.3, dmg: 22, speed: 1350, knock: 30, stun: 0.25, pierce: true, pr: 6, life: 1.1,
        muzzle: 15, pinBeats: 2, grav: 40, moveControl: 0.2, name: "Пригвождение",
        update(cs, p, act) { if (!act.kfInit) { act.kfInit = true; cs.kfNailT = cs.time; p.pistolT = 0.9; } },
      },
      xbowHail: {
        kind: "custom", startup: 0.12, active: 0.3, recovery: 0.45, cancel: 0.5, dmg: 6.2, knock: 40, stun: 0.25, moveControl: 0.2, name: "Град болтов",
        update(cs, p, act, dt) {
          const g = cs.game, col = p.skin.accent;
          if (!act.kfInit) {
            act.kfInit = true; cs.kfHailT = cs.time; p.pistolT = 0.9; act.kfN = 0; act.kfAt = act.startup;
            const list = kfAhead(g, p, act.dir);
            act.kfList = list.length ? list : act.target ? [act.target] : [];
            g.sfx("combo", 1.2);
          }
          if (act.phase === "startup") p.vx = damp(p.vx, 0, 14, dt);
          // пять болтов подряд: взлетают вверх-вперёд и падают на врагов (цели по кругу)
          while (act.kfN < 5 && act.t >= act.startup + act.kfN * 0.055) {
            const i = act.kfN++, h = CharacterRenderer.handWorld(p, 15), tg = act.kfList.length ? act.kfList[i % act.kfList.length] : null;
            const tx = tg ? tg.x + (i % 3 - 1) * 9 : p.x + act.dir * (200 + i * 45), ty = tg ? tg.centerY : -12;
            const T = 0.62 + i * 0.05, G = 900;
            cs.spawnProjectile({ x: h.x, y: h.y, vx: (tx - h.x) / T, vy: (ty - h.y - 0.5 * G * T * T) / T, owner: "player", act, r: 3.4, color: col, life: 1.6, pierce: false, grav: G, draw: kfBoltDraw });
            g.fx.sparks(h.x, h.y, 3, col, 200, -KF_HALF, 0.6, 0.18);
            g.fx.ring(h.x, h.y, 2, 9, "#ffffff", 0.12, 1.4);
            g.sfx("shot");
          }
        },
      },
    },
    choose(cs, name, c) {
      if (c.air || !c.target || name === "backShot") return;
      const p = c.p, crowd = cs.game.enemies.filter(e => e.targetable && sign(e.x - p.x) === sign(c.target.x - p.x) && Math.abs(e.x - p.x) < 560).length;
      if (c.good && c.j.strong && cs.groove >= 2 && crowd >= 2 && kfSince(cs, "kfHailT") > 1.8) return "xbowHail";
      if (c.j.rating === "perfect" && c.j.strong && kfSince(cs, "kfNailT") > 1.2) return "xbowNail";
    },
    takedown(cs, kind) { return kind === "colossus" ? null : "xbowImpale"; },
  });

  // «ПРИГВОЖДЕНИЕ»: три болта подряд, между ними взвод рычагом; враг сползает назад и застывает на последнем
  const XI = { b1: 0.14, b2: 0.5, b3: 0.86 };
  registerTakedown("xbowImpale", {
    name: "ПРИГВОЖДЕНИЕ", dur: 1.3, death: "shot",
    update(cs, td, api) {
      const g = cs.game, p = g.player, e = td.e, t = api.t, d = td.dir, col = api.col;
      p.pistolT = 0.9; p.x = td.px; p.y = td.py; p.facing = d;
      const ecy = e.y - e.h * e.scale * 0.5;
      g.camera.retarget(lerp(p.x, e.x, 0.5), ecy - 6);
      const slide = (Math.min(1, easeOut((t - XI.b1) / 0.1)) + (t > XI.b2 ? easeOut((t - XI.b2) / 0.1) : 0) + (t > XI.b3 ? easeOut((t - XI.b3) / 0.1) : 0)) * 8;
      e.x = td.ex + d * slide;
      if (t < XI.b3) e.tdPose = { lean: -0.12 - 0.08 * (t > XI.b2 ? 1 : 0), armF: -1.0, armB: -1.2, bodyY: 1.4, headTilt: -0.2 };
      else e.tdPose = { lean: -0.3, armF: -2.4, armB: -2.2, bodyY: 0.4, headTilt: -0.4 };
      const fire = (big, dyo) => {
        const h = CharacterRenderer.handWorld(p, 15), tx = e.x, ty = ecy + dyo;
        kfTracer(g, api, h.x, h.y, tx, ty, big ? 1.6 : 1);
        // древко торчит из врага до конца сцены
        g.fx.cut(tx - d * 14, ty - 3, tx + d * 2, ty + 1, "#cfd3e0", 1.2, api.life(1.0));
        g.fx.cut(tx - d * 14, ty - 3, tx - d * 10, ty - 2, col, 2.2, api.life(1.0));
        g.fx.sparks(tx, ty, big ? 6 : 3, col, 170, d > 0 ? 0 : Math.PI, 1.0, 0.2);
        g.sfx("shot"); g.sfx("bulletHit");
        e.flash = 0.5; e.hitKick = 1; g.camera.shake(big ? 0.2 : 0.08); g.camera.kick(big ? 0.02 : 0.008);
      };
      api.once("b1", XI.b1, () => fire(false, -5));
      api.once("l1", XI.b1 + 0.1, () => g.sfx("step"));
      api.once("b2", XI.b2, () => fire(false, 6));
      api.once("l2", XI.b2 + 0.1, () => g.sfx("step"));
      api.once("b3", XI.b3, () => { fire(true, 0); g.fx.ring(e.x, e.y - 2, 4, 36, col, api.life(0.3), 2); api.finish(); });
    },
    pose(cs, p, td) {
      const t = td.t, e = td.e, ph = (a, b) => clamp((t - a) / (b - a), 0, 1);
      const ang = Math.atan2(e.y - e.h * e.scale * 0.5 - (p.y - 20), Math.abs(e.x - p.x)), aim = KF_HALF - ang;
      let kick = 0, lever = 0, u = 1, since = 9;
      for (const s0 of [XI.b1, XI.b2, XI.b3]) {
        const s = t - s0;
        if (s >= 0 && s < 0.14) kick = Math.max(kick, 1 - s / 0.14);
        if (s >= 0) { since = s; u = clamp((s - 0.08) / 0.32, 0, 1); lever = Math.sin(Math.PI * u); }      // взвод рычагом после последнего выстрела
      }
      const ready = easeOut(ph(0, 0.1));
      const P = {
        armF: lerp(0.35, aim, ready) - kick * 0.12, elbowF: 0, armB: lerp(-0.45, aim - 0.26, ready) + kick * 0.08 - 1.1 * lever, lean: 0.06 - kick * 0.06,
        bodyY: 2 + kick * 0.6 + 0.6 * lever, legSpread: 1.8, sx: 1.02, headTilt: -0.08 + 0.18 * lever, wBlend: 0,
      };
      if (t > 1.05) P.armF = lerp(P.armF, 0.9, easeInOut(ph(1.05, 1.25)));
      p.xbCock = since < 9 ? (since < 0.08 ? 0 : u) : 1;
      p.xbLoad = since < 9 ? (since >= 0.08 && u > 0.8 ? 1 : 0) : 1; p.xbAt = performance.now();
      return P;
    },
  });

  /* =====================================================================
     РУЧНОЙ ГРАНАТОМЁТ
     ===================================================================== */
  const LN_G = 1100;
  const lnPose = (P, act, p, k) => {
    const def = act.def;
    if (def.kind !== "ranged" && def.kind !== "custom") return;
    const ang = kfAim(act, p), aim = KF_HALF - ang, t = act.t;
    const kick = kfKick(act, 0.22), casc = act.name === "launchCascade", blast = act.name === "launchBlast";
    const ready = easeOut(clamp(t / Math.max(0.03, act.startup), 0, 1));
    // двумя руками на уровне пояса, ствол задран для навесного выстрела; «бух» — ствол подпрыгивает, корпус откидывается
    P.armF = lerp(0.35, aim, ready) + kick * 0.4; P.elbowF = 0; P.armB = lerp(-0.4, aim - 0.3, ready) + kick * 0.3;
    P.lean = 0.02 - kick * 0.2 - (casc ? 0.04 : 0); P.bodyY = 2 + kick * 1.3; P.legSpread = 1.75; P.sx = 1.03 - kick * 0.05; P.headTilt = -0.06 - kick * 0.1; P.wBlend = 0;
    P.cloak = -kick * 0.9;
    if (blast) { P.lean = 0.22 - kick * 0.1; P.bodyY = 1.4; }
    if (def.hip) { P.armF = lerp(0.2, aim + 0.2, ready) + kick * 0.3; P.armB = -0.5; P.lean = 0.12; }
    // перезарядка: ствол опускается, барабан откидывается, задняя рука несёт новую гранату и возвращается
    const u = kfReload(act, k, 0.1, 0.8), sw = Math.sin(Math.PI * clamp(u / 0.9, 0, 1));
    let open = 0;
    if (act.phase === "recovery") {
      P.armF = lerp(P.armF, 0.55, sw); P.armB = lerp(P.armB, 0.35 + 0.3 * Math.sin(u * Math.PI * 2), sw);
      P.bodyY += 0.5 * sw; P.headTilt = lerp(P.headTilt, 0.14, sw);
      open = sw;
    }
    p.lnOpen = open; p.lnAt = performance.now();
  };

  const kfGrenInit = cs => { if (!cs.kfGren) cs.kfGren = []; return cs.kfGren; };
  /** Граната из дула: дуга в точку (tx, ty), взрыв на ближайшей доле после посадки (+ off долей в секундах). */
  const kfLaunch = (cs, p, act, n) => {
    const g = cs.game, def = act.def, col = p.skin.accent, list = kfGrenInit(cs);
    const hand = CharacterRenderer.handWorld(p, def.muzzle || 15);
    if (n === 1) hand.y += 3;
    const tg = act.target, dir = act.dir;
    const feet = act.name === "launchBlast", casc = act.name === "launchCascade", shots = def.shots || 1;
    let tx = tg ? tg.x : p.x + dir * 260, ty = tg ? tg.y : p.y;
    if (def.spread) tx += (n - (shots - 1) / 2) * def.spread * 260 * dir;        // «Веер»: гранаты ложатся вразброс
    if (casc) tx = p.x + dir * (Math.max(70, (tg ? Math.abs(tg.x - p.x) : 260) - 60) + n * 62);     // «Каскад»: шагает через цель
    if (feet) tx = tg ? tg.x - dir * 6 : p.x + dir * 40;
    tx = clamp(tx, 20, WORLD.w - 20);
    const dist = Math.abs(tx - hand.x);
    const T = feet ? 0.17 : clamp(dist / 650, 0.25, 0.6);
    const off = casc ? n * g.clock.period / 4 : 0;
    const tb = g.clock.nextBeatAfter(g.songNow, T + 0.07) + off;
    const gy = ty - 3.4;
    list.push({
      x: hand.x, y: hand.y, lx: tx, vx: (tx - hand.x) / T, vy: (gy - hand.y - 0.5 * LN_G * T * T) / T, gy, tb, fuse: tb - g.songNow, act, def, col, R: def.blast || 74,
      k: def.gk || 1, landed: false, bounce: 0, age: 0, rot: 0, dir, snd: false, lift: !!def.lift, trail: 0,
    });
    const gr = list[list.length - 1];
    if (g.timeScale > 0.97) { g.sfxAt(tb, "slam"); gr.snd = true; }
    g.fx.sparks(hand.x, hand.y, 6, col, 200, act.dir > 0 ? -0.8 : Math.PI + 0.8, 0.7, 0.22);
    g.fx.ring(hand.x, hand.y, 2, 14, "#ffffff", 0.14, 2);
    if (!g.fx.low) g.fx.smoke(hand.x + dir * 4, hand.y - 1, 1, "#5a5662", 0.5);
    if (def.recoil && n === 0 && p.onGround) p.vx -= act.dir * def.recoil;
    if (act.shotSound && n === 0) act.shotSound = false; else g.sfx("shot");
    g.camera.kick(act.onBeat ? 0.014 : 0.006);
    if (act.onBeat && n === 0) { g.fx.glow(hand.x, hand.y, 4, 26, "#ffffff", 0.12, 0.5); g.camera.shake(0.1); }
  };

  /** Взрыв по площади: урон со спадом по расстоянию, отбрасывание от центра, подброс (def.lift), кольца и осколки. */
  const kfExplode = (cs, gr) => {
    const g = cs.game, act = gr.act, col = gr.col, low = g.fx.low, R = gr.R, cx = gr.x, cy = gr.y - 6;
    for (const e of g.enemies) {
      if (!e.targetable) continue;
      const dx = e.x - cx, dy = (e.centerY - cy) * 0.85;
      const d = Math.hypot(dx, dy) - e.w * e.scale * 0.35;
      if (d > R) continue;
      const fall = d < R * 0.4 ? 1 : 1 - 0.5 * (d - R * 0.4) / (R * 0.6);
      act.dmgK = gr.k * fall;
      cs._applyHit(e, act, sign(dx) || act.dir, e.x, e.centerY);
      if (e.alive && !e.executed) {
        if (gr.lift && e.kind !== "brute") { e.vy = -420 * fall; e.onGround = false; }
        e.vx += sign(dx) * 140 * fall;
      }
    }
    act.dmgK = 1;
    g.fx.ring(cx, cy, 8, R * 1.25, "#ffffff", 0.24, 3);
    g.fx.ring(cx, cy, 4, R * 0.9, col, 0.34, 2.4);
    g.fx.sparks(cx, cy, low ? 8 : 16, col, 300, null, Math.PI, 0.3);
    g.fx.sparks(cx, cy, 6, "#ffffff", 220, null, Math.PI, 0.2);
    g.fx.shards(cx, cy, low ? 3 : 6, "#2a2c38", 200);
    g.fx.dust(cx, gr.gy + 3, low ? 3 : 7);
    if (!low) { g.fx.glow(cx, cy, 10, R * 1.5, col, 0.28, 0.6); g.fx.glow(cx, cy, 6, R * 0.8, "#ffffff", 0.14, 0.7); g.fx.smoke(cx, cy, 2, "#3a3c48", 0.8); }
    g.camera.shake(0.38); g.camera.kick(0.04);
    if (!gr.snd) { g.sfx("slam"); }
  };

  /** Шаг гранат (полёт, посадка, взрыв на доле) и удержание пригвождённых врагов. */
  const kfTick = (cs, dt) => {
    const g = cs.game, list = kfGrenInit(cs), now = g.songNow;
    for (let i = list.length - 1; i >= 0; i--) {
      const gr = list[i];
      gr.age += dt;
      if (!gr.landed) {
        gr.vy += LN_G * dt; gr.x += gr.vx * dt; gr.y += gr.vy * dt; gr.rot += dt * 11;
        gr.trail -= dt;
        if (gr.trail <= 0 && !g.fx.low) { gr.trail = 0.035; g.fx.sparks(gr.x, gr.y, 1, gr.col, 50, null, Math.PI, 0.16); }
        if (gr.vy > 0 && gr.y >= gr.gy) {
          gr.y = gr.gy;
          if (gr.bounce < 1 && gr.vy > 180) { gr.vy = -gr.vy * 0.3; gr.vx *= 0.45; gr.bounce++; g.sfx("land", 0.4); }
          else { gr.landed = true; gr.vx = gr.vy = 0; }
        }
      }
      // детонация ровно на доле; запас по возрасту — если часы ушли (перемотка/зацикливание) или полёт затянулся
      if (now >= gr.tb - 0.012 || gr.age > 2.4 || now < gr.tb - 3) {
        list.splice(i, 1);
        kfExplode(cs, gr);
      }
    }
    for (const e of g.enemies) {
      if (!(e.kfPin > 0)) { if (e.kfBolt) e.kfBolt = null; continue; }
      e.kfPin -= dt;
      if (!e.alive || e.executed) { e.kfPin = 0; continue; }
      e.vx = 0; if (!e.onGround) e.vy = Math.max(e.vy, 260);
      e.attackCD = Math.max(e.attackCD, 0.15);
      if (e.state === "hurt") e.stateT = Math.min(e.stateT, (e.hurtDur || 0.3) - 0.05);
    }
  };

  /** Гранаты в воздухе и на земле (мигающий огонёк, зона взрыва на земле заполняется к доле) и болты, торчащие из врагов. */
  const kfDraw = (cs, ctx, hq) => {
    const g = cs.game, now = g.songNow;
    for (const e of g.enemies) {
      if (!(e.kfPin > 0) || !e.kfBolt || !e.alive || e.executed) continue;
      const b = e.kfBolt, x = e.x + b.ox, y = e.y + b.oy, c = Math.cos(b.a), s = Math.sin(b.a), a = clamp(e.kfPin / 0.15, 0, 1);
      ctx.save(); ctx.globalAlpha = a;
      ctx.lineCap = "round"; ctx.strokeStyle = "#cfd3e0"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x - c * 15, y - s * 15); ctx.lineTo(x + c * 3, y + s * 3); ctx.stroke();
      ctx.strokeStyle = g.player.skin.accent; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x - c * 15, y - s * 15); ctx.lineTo(x - c * 11, y - s * 11); ctx.stroke();
      // «якорь»: короткая чёрточка у ног — враг прижат к полу
      ctx.globalAlpha = a * 0.7; ctx.strokeStyle = g.player.skin.accent; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(e.x - 9, e.y - 0.5); ctx.lineTo(e.x + 9, e.y - 0.5); ctx.stroke();
      ctx.restore();
    }
    for (const gr of cs.kfGren || []) {
      const rem = gr.tb - now, prog = clamp(1 - rem / Math.max(0.1, gr.fuse), 0, 1);
      // зона взрыва: тонкий эллипс на земле, внутренний растёт к доле
      ctx.save();
      ctx.strokeStyle = gr.col; ctx.lineWidth = 0.8;
      ctx.globalAlpha = 0.22 + 0.4 * prog;
      ctx.beginPath(); ctx.ellipse(gr.lx, gr.gy + 3.4, gr.R, gr.R * 0.2, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.35 + 0.5 * prog; ctx.fillStyle = rgba(gr.col, 0.12);
      ctx.beginPath(); ctx.ellipse(gr.lx, gr.gy + 3.4, gr.R * prog, gr.R * 0.2 * prog, 0, 0, TAU); ctx.fill();
      ctx.restore();
      // сама граната: тёмный шар с неоновым кольцом и мигающим огоньком (чаще к взрыву)
      ctx.save(); ctx.translate(gr.x, gr.y); ctx.rotate(gr.rot);
      ctx.fillStyle = "#1c1d25"; ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, TAU); ctx.fill();
      if (hq) { ctx.globalAlpha = 0.35; ctx.strokeStyle = gr.col; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.strokeStyle = gr.col; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, TAU); ctx.stroke();
      ctx.fillStyle = "#101117"; ctx.fillRect(-0.8, -4.6, 1.6, 1.8);
      const on = rem < 0.2 || Math.floor(Math.max(0, rem) * (6 + 10 * prog)) % 2 === 0;
      if (on) { ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(1.1, -1, 0.9, 0, TAU); ctx.fill(); ctx.fillStyle = gr.col; ctx.beginPath(); ctx.arc(1.1, -1, 0.5, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
  };

  registerKit("launcher", {
    pose: lnPose,
    moves: {
      launchCascade: {
        kind: "ranged", startup: 0.06, active: 0.3, recovery: 0.42, cancel: 0.5, dmg: 12, speed: 800, knock: 90, stun: 0.3, shots: 3, gap: 0.13, pr: 3, muzzle: 15,
        recoil: 40, blast: 66, moveControl: 0.25, name: "Каскад",
        update(cs, p, act) { if (!act.kfInit) { act.kfInit = true; cs.kfCascT = cs.time; p.pistolT = 0.9; } },
      },
      launchBlast: {
        kind: "ranged", startup: 0.04, active: 0.2, recovery: 0.3, cancel: 0.34, dmg: 20, speed: 800, knock: 260, stun: 0.5, fireAt: 0.04, pr: 3, muzzle: 15,
        blast: 92, lift: true, moveControl: 0.3, name: "Взрыв под ногами",
        update(cs, p, act) {
          if (!act.kfInit) { act.kfInit = true; cs.kfBlastT = cs.time; p.pistolT = 0.9; }
          // выстрел под ноги и отпрыгиваем назад (в момент выстрела)
          if (act.t >= act.startup + 0.04 && !act.kfHop) {
            act.kfHop = true; p.vx = -act.dir * 250; p.vy = -250; p.onGround = false;
            cs.game.fx.dust(p.x, p.y, 4);
          }
        },
      },
    },
    choose(cs, name, c) {
      if (c.air || !c.target) return;
      if (c.good && c.dx <= 70 && Math.abs(c.dy) < 50 && kfSince(cs, "kfBlastT") > 1.0) return "launchBlast";
      if (c.good && c.j.strong && cs.groove >= 1 && c.dx >= 100 && kfSince(cs, "kfCascT") > 1.6) return "launchCascade";
    },
    takedown(cs, kind) { return kind === "colossus" ? null : "launcherAirburst"; },
  });

  // «ФУГАС»: первая граната под ноги подбрасывает врага, вторая рвётся прямо в нём в воздухе
  const LA = { l1: 0.14, e1: 0.44, l2: 0.66, e2: 0.94 };
  const laArc = (x0, y0, x1, y1, T, k) => ({ x: lerp(x0, x1, k), y: lerp(y0, y1, k) - 4 * 26 * k * (1 - k) * (T / 0.3) });
  registerTakedown("launcherAirburst", {
    name: "ФУГАС", dur: 1.3, death: "shot",
    update(cs, td, api) {
      const g = cs.game, p = g.player, e = td.e, t = api.t, d = td.dir, col = api.col, low = api.low;
      p.pistolT = 0.9; p.x = td.px; p.y = td.py; p.facing = d;
      if (td.z0 === undefined) td.z0 = g.camera.fz;
      const H = 92, gnd = td.ey;
      // враг: до первого взрыва замер, потом взлетает и висит на вершине
      const up = easeOut(clamp((t - LA.e1) / 0.36, 0, 1));
      if (t >= LA.e1 && t < LA.e2) {
        e.y = gnd - H * up; e.x = td.ex + d * 14 * up;
        e.tdPose = { lean: -0.6 * up, armF: -2.2, armB: -2.0, tuck: 0.8 * up, headTilt: -0.4 * up, bodyY: 0.5 };
      } else if (t < LA.e1) e.tdPose = { lean: -0.1, armF: -0.7, armB: -0.9, bodyY: 1.2, headTilt: -0.12 };
      const ecx = e.x, ecy = e.y - e.h * e.scale * 0.5;
      g.camera.retarget(lerp(p.x, e.x, 0.5), t < LA.e1 ? ecy - 6 : ecy + 4, Math.min(1.5, td.z0 * (1 + 0.1 * easeInOut(clamp(t / LA.e2, 0, 1)))));
      const h = CharacterRenderer.handWorld(p, 15);
      const shell = (t0, t1, x0, y0, x1, y1) => {       // след летящей гранаты
        if (t < t0 || t > t1) return;
        const k = (t - t0) / (t1 - t0), pt = laArc(x0, y0, x1, y1, t1 - t0, k);
        g.fx.glow(pt.x, pt.y, 2.4, 7, "#ffffff", api.life(0.06), 0.8);
        g.fx.glow(pt.x, pt.y, 3, 10, col, api.life(0.09), 0.5);
      };
      if (td.hx === undefined) { td.hx = h.x; td.hy = h.y; }
      shell(LA.l1, LA.e1 - 0.06, td.hx, td.hy, td.ex, gnd - 4);
      api.once("l1", LA.l1, () => { td.hx = h.x; td.hy = h.y; g.fx.sparks(h.x, h.y, 6, col, 200, d > 0 ? -0.8 : Math.PI + 0.8, 0.7, 0.22); g.fx.ring(h.x, h.y, 2, 14, "#ffffff", api.life(0.14), 2); g.sfx("shot", true); });
      api.once("e1", LA.e1, () => {
        g.fx.ring(td.ex, gnd - 6, 8, 80, "#ffffff", api.life(0.26), 3); g.fx.ring(td.ex, gnd - 4, 4, 58, col, api.life(0.34), 2.4);
        g.fx.sparks(td.ex, gnd - 8, low ? 8 : 14, col, 300, -KF_HALF, 1.2, 0.3); g.fx.dust(td.ex, gnd, low ? 3 : 8);
        if (!low) g.fx.glow(td.ex, gnd - 8, 10, 90, col, api.life(0.28), 0.6);
        g.sfx("slam"); g.camera.shake(0.3); g.camera.kick(0.03); e.flash = 0.7; e.hitKick = 1;
      });
      // вторая граната: прямо в висящего врага
      api.once("l2", LA.l2, () => { td.h2x = h.x; td.h2y = h.y; g.fx.sparks(h.x, h.y, 6, col, 200, d > 0 ? -0.8 : Math.PI + 0.8, 0.7, 0.22); g.fx.ring(h.x, h.y, 2, 14, "#ffffff", api.life(0.14), 2); g.sfx("shot", true); });
      if (td.h2x !== undefined) shell(LA.l2, LA.e2 - 0.02, td.h2x, td.h2y, td.ex + d * 14, gnd - H - 12);
      api.once("e2", LA.e2, () => {
        g.fx.ring(ecx, ecy, 8, 110, "#ffffff", api.life(0.3), 3.4); g.fx.ring(ecx, ecy, 4, 82, col, api.life(0.4), 2.6);
        g.fx.sparks(ecx, ecy, low ? 10 : 20, col, 340, null, Math.PI, 0.34); g.fx.sparks(ecx, ecy, 6, "#ffffff", 240, null, Math.PI, 0.24);
        g.fx.shards(ecx, ecy, low ? 3 : 7, "#2a2c38", 220);
        if (!low) { g.fx.glow(ecx, ecy, 12, 120, col, api.life(0.36), 0.65); g.fx.glow(ecx, ecy, 6, 60, "#ffffff", api.life(0.18), 0.8); g.fx.smoke(ecx, ecy, 2, "#3a3c48", 0.8); }
        g.sfx("slam", true); g.sfx("bulletHit"); g.camera.shake(0.45); g.camera.kick(0.05);
        e.flash = 0.8; e.hitKick = 1;
        api.finish();
      });
    },
    pose(cs, p, td) {
      const t = td.t, e = td.e, ph = (a, b) => clamp((t - a) / (b - a), 0, 1);
      const ang = -clamp(Math.abs(e.x - p.x) / 800, 0.22, 0.6), aim = KF_HALF - ang;
      let kick = 0;
      for (const s0 of [LA.l1, LA.l2]) { const s = t - s0; if (s >= 0 && s < 0.2) kick = Math.max(kick, 1 - s / 0.2); }
      const ready = easeOut(ph(0, 0.12));
      const P = {
        armF: lerp(0.35, aim, ready) + kick * 0.4, elbowF: 0, armB: lerp(-0.4, aim - 0.3, ready) + kick * 0.3, lean: 0.02 - kick * 0.2, bodyY: 2 + kick * 1.3,
        legSpread: 1.75, sx: 1.03 - kick * 0.05, headTilt: -0.06 - kick * 0.1, wBlend: 0, cloak: -kick * 0.9,
      };
      let open = 0;
      if (t > LA.l1 + 0.1 && t < LA.l2 - 0.06) {         // перезарядка между гранатами
        const u = ph(LA.l1 + 0.1, LA.l2 - 0.06), sw = Math.sin(Math.PI * u);
        P.armF = lerp(P.armF, 0.55, sw); P.armB = lerp(P.armB, 0.35 + 0.3 * Math.sin(u * Math.PI * 2), sw); P.bodyY += 0.5 * sw; P.headTilt = lerp(P.headTilt, 0.14, sw); open = sw;
      }
      if (t > 1.05) { const k = easeInOut(ph(1.05, 1.3)); P.armF = lerp(P.armF, 0.9, k); P.armB = lerp(P.armB, 0.2, k); P.bodyY = lerp(P.bodyY, 0.6, k); P.legSpread = lerp(1.75, 1.2, k); }
      p.lnOpen = open; p.lnAt = performance.now();
      return P;
    },
  });

  /* =====================================================================
     ОБЁРТКИ СИСТЕМЫ БОЯ (эффекты фаз, пригвождение, гранаты)
     ===================================================================== */
  {
    // обычные выстрелы гранатомёта — гранаты; болты арбалета — по дуге с поправкой прицела
    const fire0 = CombatSystem.prototype._fire;
    CombatSystem.prototype._fire = function (p, act, n = 0) {
      if (act.def.w && act.def.w.id === "launcher" && act.def.kind === "ranged") return kfLaunch(this, p, act, n);
      return fire0.call(this, p, act, n);
    };
    const sp0 = CombatSystem.prototype.spawnProjectile;
    CombatSystem.prototype.spawnProjectile = function (o) {
      const w = o.act && o.act.def.w;
      if (w && w.id === "crossbow" && o.owner === "player" && !o.draw) {
        const G = o.act.def.grav !== undefined ? o.act.def.grav : XB_G, tg = o.act.target;
        o.grav = G; o.draw = kfBoltDraw;
        if (tg && Math.abs(o.vx) > 1) o.vy -= 0.5 * G * Math.abs(tg.x - o.x) / Math.abs(o.vx);     // дуга приходит в цель
      }
      return sp0.call(this, o);
    };
    // пригвождение при попадании болтом (в т.ч. приёмами набора)
    const ah0 = CombatSystem.prototype._applyHit;
    CombatSystem.prototype._applyHit = function (e, act, dirX, hx, hy) {
      const r = ah0.call(this, e, act, dirX, hx, hy);
      const w = act.def.w;
      if (w && w.id === "crossbow" && e.alive && !e.executed) kfPin(this, e, act, hx, hy, dirX);
      return r;
    };
    const rs0 = CombatSystem.prototype.reset;
    CombatSystem.prototype.reset = function () { rs0.call(this); this.kfGren = []; };
    const up0 = CombatSystem.prototype.update;
    CombatSystem.prototype.update = function (dt) { up0.call(this, dt); kfTick(this, dt); };
    const dp0 = CombatSystem.prototype.drawProjectiles;
    CombatSystem.prototype.drawProjectiles = function (ctx, hq) { dp0.call(this, ctx, hq); kfDraw(this, ctx, hq); };

    // эффекты на восстановлении: гильза винтовки, щелчок рычага арбалета, дымок и стук гранаты
    const ua0 = CombatSystem.prototype.updateAction;
    CombatSystem.prototype.updateAction = function (p, act, dt) {
      ua0.call(this, p, act, dt);
      const def = act.def, id = def.w && def.w.id;
      if (id !== "sniper" && id !== "crossbow" && id !== "launcher") return;
      if (def.kind !== "ranged" && def.kind !== "custom") return;
      if (act.phase !== "recovery") return;
      const g = this.game, low = g.fx.low, r = clamp((act.t - act.startup - act.travel - act.active) / Math.max(0.01, act.recovery), 0, 1);
      if (id === "sniper" && !act.kfCase && r > 0.3) {
        act.kfCase = true;
        const h = CharacterRenderer.handWorld(p, 4);
        g.fx.shards(h.x, h.y, 1, "#d9b54a", 80); g.sfx("step");
        if (!low) g.fx.smoke(h.x + act.dir * 18, h.y - 1, 1, "#5a5662", 0.55);
      } else if (id === "crossbow" && !act.kfLever && r > 0.3) {
        act.kfLever = true; g.sfx("step");
        const h = CharacterRenderer.handWorld(p, 8);
        if (!low) g.fx.glow(h.x, h.y, 1.5, 7, "#ffffff", 0.08, 0.4);
      } else if (id === "launcher" && !act.kfOpen && r > 0.25) {
        act.kfOpen = true; g.sfx("step");
        const h = CharacterRenderer.handWorld(p, 6);
        if (!low) g.fx.smoke(h.x, h.y, 1, "#5a5662", 0.6);
      }
    };
  }
}
