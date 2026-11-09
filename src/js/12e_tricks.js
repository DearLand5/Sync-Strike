/* =====================================================================
   Трюки оружия ближнего боя (по просьбе: «анимации трюков для каждого орудия ближнего боя, когда я не атакую;
   после урона — гладко перетекать, и так же — перед следующим ударом»). Заменили пафосные позы.
   Трюк — короткая игра с оружием в руке (прокрутка, перехват, вращение груза, тибури…), пока герой стоит или идёт:
     • после атаки, которая попала, трюк начинается почти сразу (0,14 с) — удар «перетекает» в трюк;
     • в покое — раз в 1,4–2,6 с, старт на доле;
     • трюк идёт и на ходу/бегу и в прыжке (только руки и оружие); прерывают атака, уклон, урон, огнестрел: поза плавно уходит в следующую
       (смешивание позы), угол оружия сводится к [−π, π] — клинок не «откручивается» назад после оборотов.
   Регистрация: registerTricks(id, [{ name, beats, pose(Q, k, p, T, env) }, …]) — в модуле оружия.
     Q — пустой объект позы, куда трюк пишет нужные ключи (как в позах атак); k — ход трюка 0..1;
     p — герой; T — состояние трюка (T.seed — случайное 0..1 на запуск); env — огибающая 0..1 (вход/выход).
     На ходу (walk) применяются только ключи рук и оружия (TRICK_UPPER) — ноги и корпус идут шагом.
     Цепь кусаригамы и подобное задаются прямо на герое (p.kuX…, p.wExt) с учётом env.
   Длительность — beats долей трека (0,6–2,6 с).
   ===================================================================== */
const WEAPON_TRICKS = {};
const TRICK_UPPER = { armF: 1, elbowF: 1, armB: 1, wBlend: 1, wAngle: 1, headTilt: 1 };
const TRICK_Q = {};
const TRICK_STATES = { idle: 1, walk: 1, run: 1, jump: 1, fall: 1, land: 1 };
function registerTricks(id, list) { WEAPON_TRICKS[id] = list; }

const trickWrap = a => a - TAU * Math.round(a / TAU);

/** Конец трюка: угол оружия — к ближайшему эквиваленту (визуально тот же), чтобы следующая поза не крутила клинок назад. */
function trickEnd(p) {
  if (!p.trick) return;
  p.trick = null;
  const q = p.anim.pose; q.wAngle = trickWrap(q.wAngle || 0);
}

/** Шаг логики трюков (из Player.update, после состояний). */
function trickUpdate(p, dt, g) {
  if (p.action) {
    p._hadAct = true;
    if (p.action.hit && p.action.hit.size) p._actHit = true;
    trickEnd(p);
    return;
  }
  if (p._hadAct) { p._hadAct = false; p.trickWait = p._actHit ? 0.14 : Math.max(p.trickWait, 0.9); p._fast = p._actHit; p._actHit = false; }
  const list = WEAPON_TRICKS[weaponOf("melee", g.settings.v).id];
  // трюки идут стоя, на ходу, на бегу и в прыжке (по просьбе); в движении и в воздухе — только руки и оружие (TRICK_UPPER)
  const ok = list && list.length && g.state === "battle" && p.pistolT <= 0 && !p.scripted && p.killT <= 0 && TRICK_STATES[p.state];
  if (!ok) { if (p.trick) { trickEnd(p); p.trickWait = Math.max(p.trickWait, 0.5); } return; }
  const T = p.trick;
  if (T) {
    T.t += dt;
    if (T.t >= T.dur) { trickEnd(p); p.trickWait = 0.9 + Math.random() * 1.0; }
    return;
  }
  p.trickWait -= dt;
  if (p.trickWait > 0) return;
  // старт на доле (или сразу, если доля вот-вот/только что была)
  const c = g.clock, P = c.map ? c.period : 0.5;
  if (c.map && g.audio.playing && !p._fast) {
    const to = c.nextBeat - g.songNow;
    if (to > 0.08 && to < P - 0.06) return;
  }
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === p.trickLast) i = (i + 1) % list.length;
  p.trickLast = i; p._fast = false;
  const def = list[i];
  p.trick = { def, t: 0, dur: clamp((def.beats || 2) * P, 0.6, 2.6), seed: Math.random() };
  p.tricks = (p.tricks || 0) + 1;
}

/** Поза трюка поверх позы покоя/шага: P — целевая поза состояния, moving — идёт шагом (только руки и оружие). */
function trickPose(p, P, moving) {
  const T = p.trick;
  if (!T) return;
  const k = clamp(T.t / T.dur, 0, 1);
  const env = easeInOut(clamp(Math.min(k / 0.2, (1 - k) / 0.22), 0, 1));
  for (const key in TRICK_Q) delete TRICK_Q[key];
  T.def.pose(TRICK_Q, k, p, T, env);
  const cur = p.anim.pose;
  for (const key in TRICK_Q) {
    if (moving && !TRICK_UPPER[key]) continue;
    const v = TRICK_Q[key];
    if (key === "wAngle") { P.wAngle = v; continue; }      // угол виден только через wBlend (он смешивается с огибающей)
    const base = P[key] != null ? P[key] : cur[key] != null ? cur[key] : BASE_POSE[key] || 0;
    P[key] = lerp(base, v, env);
  }
}

/* ---------- трюки оружия ---------- */
{
  const s2 = k => Math.sin(Math.PI * k);
  // теневой кинжал: вертушка в пальцах, смена хвата, росчерк восьмёркой
  registerTricks("dagger", [
    { name: "Вертушка", beats: 2, pose(Q, k) {
      Object.assign(Q, { armF: 1.15, elbowF: 1.05, armB: -0.35, wBlend: 1, wAngle: -0.6 + TAU * 3 * easeInOut(k), headTilt: 0.14, lean: 0.04 });
    } },
    { name: "Смена хвата", beats: 2, pose(Q, k) {
      const f = k < 0.5 ? easeInOut(k / 0.5) : 1 - easeInOut((k - 0.5) / 0.5);
      Object.assign(Q, { armF: 0.5 + 1.1 * s2(k), elbowF: 0.7, wBlend: 1, wAngle: -0.7 + (Math.PI + 0.3) * f, headTilt: 0.1, armB: -0.2 });
    } },
    { name: "Росчерк", beats: 2, pose(Q, k) {
      const a = TAU * 2 * k;
      Object.assign(Q, { armF: 1.35 + 0.55 * Math.sin(a), elbowF: 0.35, wBlend: 1, wAngle: -0.6 + 1.5 * Math.sin(a + 0.6), lean: 0.08, legSpread: 1.35, headTilt: 0.05, armB: -0.6 });
    } },
  ]);
  // ночное копьё: мельница перед собой, оборот над головой, упор древком в землю
  registerTricks("spear", [
    { name: "Мельница", beats: 2, pose(Q, k) {
      Object.assign(Q, { armF: 1.4, elbowF: 0.35, armB: 1.15, wBlend: 1, wAngle: -0.95 + TAU * 2 * easeInOut(k), legSpread: 1.5, bodyY: 0.8, lean: 0.03 });
    } },
    { name: "Над головой", beats: 2, pose(Q, k) {
      Object.assign(Q, { armF: 2.75, elbowF: 0.25, armB: -0.5, wBlend: 1, wAngle: -0.1 + TAU * 1.5 * easeInOut(k), headTilt: -0.12, lean: -0.04 });
    } },
    { name: "Упор", beats: 2, pose(Q, k) {
      const e = easeOut(clamp(k / 0.35, 0, 1));
      Object.assign(Q, { armF: lerp(0.6, 1.05, e), elbowF: lerp(0.5, 1.0, e), wBlend: 1, wAngle: lerp(-0.95, -Math.PI / 2 + 0.12, e), armB: lerp(-0.3, 0.9, e), headTilt: -0.1 * e, lean: -0.05 * e, bodyY: -0.5 * e });
    } },
  ]);
  // лунная глефа (двусторонняя, хват посередине): пропеллер над головой, восьмёрка перед собой, оборот за спиной
  registerTricks("glaive", [
    { name: "Пропеллер", beats: 2, pose(Q, k) {
      Object.assign(Q, { armF: 2.85, elbowF: 0.2, armB: -0.6, wBlend: 1, wAngle: TAU * 2.5 * easeInOut(k), headTilt: -0.15, bodyY: 0.6, legSpread: 1.3 });
    } },
    { name: "Восьмёрка", beats: 3, pose(Q, k) {
      const a = TAU * 2 * k;
      Object.assign(Q, { armF: 1.4 + 0.35 * Math.sin(a), elbowF: 0.4, armB: 1.1, wBlend: 1, wAngle: TAU * 2 * easeInOut(k) + 0.7 * Math.sin(a), lean: 0.05 * Math.sin(a), legSpread: 1.45, bodyY: 0.7 });
    } },
    { name: "Лунная стойка", beats: 2, pose(Q, k) {
      const e = easeOut(clamp(k / 0.3, 0, 1)), sp = easeInOut(clamp((k - 0.55) / 0.45, 0, 1));
      Object.assign(Q, { armF: lerp(1.0, 1.57, e), elbowF: 0.15, armB: lerp(-0.3, 1.45, e), wBlend: 1, wAngle: -0.75 * (1 - e) + TAU * sp, legSpread: 1.6, bodyY: 1.2 * e, lean: -0.04 * e, headTilt: -0.08 });
    } },
  ]);
  // цепной серп: груз вращается сбоку, над головой, восьмёркой перед собой (серп в руке не крутится)
  const chain = (p, x, y, b, s, w) => { p.kuX = x; p.kuY = y; p.kuB = b; p.kuS = s; p.wExt = w; };
  registerTricks("kusari", [
    { name: "Колесо груза", beats: 2, pose(Q, k, p, T, env) {
      const th = -TAU * 4 * k;
      Object.assign(Q, { armF: 0.85, elbowF: 0.35, armB: -0.4, headTilt: 0.08 });
      chain(p, 5 + 17 * Math.cos(th), 5 + 17 * Math.sin(th), -2, 1, env);
    } },
    { name: "Лассо", beats: 2, pose(Q, k, p, T, env) {
      const th = TAU * 5 * k;
      Object.assign(Q, { armF: 2.8, elbowF: 0.25, armB: -0.6, headTilt: -0.12, bodyY: 0.4 });
      chain(p, 24 * Math.cos(th), -3 + 7 * Math.sin(th), -4, 1, env);
    } },
    { name: "Восьмёрка", beats: 3, pose(Q, k, p, T, env) {
      const th = TAU * 3 * k;
      Object.assign(Q, { armF: 1.3, elbowF: 0.3, armB: -0.5, lean: 0.04, legSpread: 1.3 });
      chain(p, 18 + 15 * Math.sin(th), 5 + 9 * Math.sin(2 * th), -3, 1.5, env);
    } },
  ]);
  // багровая катана: тибури (стряхнуть кровь), ното (медленно в ножны у бедра), вертушка и клинок на плечо
  registerTricks("katana", [
    { name: "Тибури", beats: 2, pose(Q, k) {
      const up = easeOut(clamp(k / 0.4, 0, 1)), dn = easeOut(clamp((k - 0.42) / 0.12, 0, 1));
      Object.assign(Q, { armF: lerp(lerp(0.4, 2.5, up), 0.7, dn), elbowF: 0.25, wBlend: 1, wAngle: lerp(lerp(-0.6, -1.3, up), 0.85, dn), armB: -0.3, headTilt: 0.06 * dn, lean: 0.06 * dn, legSpread: 1.25 });
    } },
    { name: "Ното", beats: 3, pose(Q, k) {
      const e = easeInOut(k);
      Object.assign(Q, { armF: lerp(1.0, -0.15, e), elbowF: lerp(0.4, 1.45, e), wBlend: 1, wAngle: lerp(-0.4, Math.PI - 0.12, e), armB: lerp(-0.3, 0.2, e), headTilt: 0.1, lean: -0.03, legSpread: 1.2 });
    } },
    { name: "Вертушка", beats: 2, pose(Q, k) {
      const sp = easeInOut(clamp(k / 0.65, 0, 1)), sh = easeInOut(clamp((k - 0.62) / 0.3, 0, 1));
      Object.assign(Q, { armF: lerp(1.0, 2.25, sh), elbowF: lerp(0.6, 1.6, sh), wBlend: 1, wAngle: -0.55 + TAU * 2 * sp + (-2.4 + 0.55) * sh, headTilt: -0.08 * sh, armB: -0.3 });
    } },
  ]);
  // боевой топор: на плечо и размять плечи, тяжёлая прокрутка, похлопать обухом по ладони
  registerTricks("axe", [
    { name: "На плечо", beats: 3, pose(Q, k) {
      const e = easeOut(clamp(k / 0.3, 0, 1));
      Object.assign(Q, { armF: lerp(0.6, 2.55, e), elbowF: lerp(0.5, 1.9, e), wBlend: 1, wAngle: lerp(-0.7, -2.6, e), armB: -0.4, bodyY: 0.6 * Math.sin(TAU * 2 * k) * e, headTilt: 0.08 * Math.sin(TAU * k) * e, lean: -0.05 * e });
    } },
    { name: "Прокрутка", beats: 2, pose(Q, k) {
      Object.assign(Q, { armF: 1.25, elbowF: 0.55, wBlend: 1, wAngle: -0.7 + TAU * easeInOut(k), armB: -0.5, lean: -0.04, legSpread: 1.4, bodyY: 0.8 * s2(k) });
    } },
    { name: "Обух о ладонь", beats: 2, pose(Q, k) {
      const tap = Math.abs(Math.sin(TAU * 2 * k));
      Object.assign(Q, { armF: 1.25 - 0.3 * tap, elbowF: 0.9, wBlend: 1, wAngle: 0.25 + 0.3 * tap, armB: 1.15, headTilt: 0.12, lean: 0.03 });
    } },
  ]);
}
