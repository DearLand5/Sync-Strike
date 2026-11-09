/* =====================================================================
   Наборы оружия (kits) — у каждого оружия свои анимации атак, свои комбинации и свои добивания.
   Оружие регистрирует набор в своём модуле (12k_<группа>.js) через registerKit(id, kit). Поля набора (все необязательные):

   moves: { имя: def }   — собственные приёмы оружия. def — как запись ATTACKS (kind "melee" | "dash" | "ranged" | "dive"
                            работают встроенной механикой 12_combat) или kind "custom" — вся механика в def.update.
                            Дополнительные поля def:
                              name      — подпись приёма (показывается при срабатывании, как у комбинаций);
                              update(cs, p, act, dt, tA) — каждый шаг 1/120 действия (после встроенной механики своего kind);
                              pose(P, act, p, k)        — поза приёма поверх встроенной (k = {s, a, r} ход фаз 0..1);
                              fx(g, p, act)             — один раз в момент удара (начало active).
                            Приёмы набора НЕ проходят множители оружия (weaponDef) — они уже настроены под своё оружие.
   choose(cs, name, ctx) — подмена выбора приёма: name — что выбрала общая логика (chooseAttack), ctx =
                            { target, j, good, air, dx, dy, away, p }. Вернуть имя своего приёма или ничего.
                            Вызывается только для набора выбранного в «Арсенале» оружия того же слота (ближний бой —
                            для приёмов melee/dash/dive, огнестрел — для ranged).
   pose(P, act, p, k)    — анимация ВСЕХ атак этим оружием (стойка, хват, замах): вызывается после weaponPose,
                            до визуального стиля приёма (12c_styles).
   takedown(cs, kind, e, act) — вернуть id своего добивания (из TD_KITS) вместо встроенного kind
                            (xcut / sky / volley / colossus) или ничего — тогда встроенное.
   Добивания: registerTakedown(id, { name, dur, air?, death, update(cs, td, api), pose(cs, p, td) }):
     name — заголовок («ЛУННЫЙ КРУГ»), dur — длительность сценария (с, во времени td.t), death — поза смерти врага
     ("split" | "slam" | "shot" | "topple"), air — сценарий может закончиться в воздухе;
     update — двигает героя/врага по td.t (p.x/p.y/p.facing, e.x/e.y, e.tdPose) и запускает события через api;
     api = { t, dt, once(key, time, fn), life(x), streak(x0, x1, y), cy, d, low, col, ec, finish() } —
     finish() вызвать один раз в момент смерти врага (как _finishTakedown); pose — поза героя (как tdPose).
   ===================================================================== */
const WEAPON_KITS = {};
const TD_KITS = {};

function registerKit(id, kit) {
  WEAPON_KITS[id] = kit;
  const w = WEAPONS[id];
  for (const name in kit.moves || {}) {
    const def = kit.moves[name];
    def.kit = id; def.w = w;
    if (!def.name) def.name = name;
    ATTACKS[name] = def;
    if (!COMBO_MOVES.includes(name)) COMBO_MOVES.push(name);
  }
}
function registerTakedown(id, td) { TD_KITS[id] = td; }

/** Набор выбранного оружия слота (или null). */
function kitOf(slot, set) { const w = weaponOf(slot, set); return WEAPON_KITS[w.id] || null; }

/** Подмена выбора приёма набором оружия. */
function kitChoose(cs, name, target, j) {
  const g = cs.game, p = g.player, base = ATTACKS[name];
  if (base.martial) return null;      // рукопашные удары (12f_martial) набор оружия не подменяет
  const kit = kitOf(base.kind === "ranged" ? "gun" : "melee", g.settings.v);
  if (!kit || !kit.choose) return null;
  const ctx = { target, j, p, air: !p.onGround, good: j.rating === "perfect" || j.rating === "good", away: Math.abs(g.input.moveX) > 0.4 && target && sign(g.input.moveX) !== sign(target.x - p.x),
    dx: target ? Math.abs(target.x - p.x) - (target.w * target.scale) / 2 - p.w / 2 : 1e9, dy: target ? target.centerY - p.centerY : 0 };
  const r = kit.choose(cs, name, ctx);
  return r && ATTACKS[r] ? r : null;
}

/** Анимация атаки: поза оружия для всех приёмов + поза собственного приёма набора. */
function kitPose(P, act, p, k, set) {
  const def = act.def;
  if (def.martial) { if (def.pose) def.pose(P, act, p, k); return; }     // рукопашный удар: своя поза, поза оружия не нужна
  const kit = def.kit ? WEAPON_KITS[def.kit] : kitOf(def.kind === "ranged" ? "gun" : "melee", set);
  if (kit && kit.pose) kit.pose(P, act, p, k);
  if (def.pose) def.pose(P, act, p, k);
}

/** Добивание набора: id из TD_KITS или null. */
function kitTakedown(cs, kind, e, act) {
  const def = act.def, set = cs.game.settings.v;
  if (def.martial) return null;       // добивание рукопашным ударом — встроенное, не оружия
  const kit = def.kit ? WEAPON_KITS[def.kit] : kitOf(def.kind === "ranged" ? "gun" : "melee", set);
  if (!kit || !kit.takedown) return null;
  const id = kit.takedown(cs, kind, e, act);
  return id && TD_KITS[id] ? id : null;
}

/* ---------- фирменные эффекты оружия (уникальность ударов в быстром бою) ----------
   registerWeaponFx(id, { slash(g, p, act, sub), thrust(g, p, act), hit(g, e, act, hx, hy, dirX, perfect, killed), hitRate }):
     slash/thrust — свой след удара вместо общей дуги/укола (вернуть false — общий след тоже рисуется);
     hit — свои искры/следы попадания поверх общих; hitRate — высота звука попадания (тяжёлое ниже, лёгкое выше).
   Для рукопашных приёмов (def.martial) не вызывается. */
const WEAPON_FX = {};
function registerWeaponFx(id, fx) { WEAPON_FX[id] = fx; }
/** Эффекты оружия, которым выполнен приём (или null). */
function weaponFxOf(act, set) {
  const def = act.def;
  if (!def || def.martial) return null;
  const id = def.kit || (def.w && def.w.id) || weaponOf(def.kind === "ranged" ? "gun" : "melee", set).id;
  return WEAPON_FX[id] || null;
}
