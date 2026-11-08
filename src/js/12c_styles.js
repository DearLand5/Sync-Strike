/* =====================================================================
   Стили приёмов — чисто визуальные варианты базовых атак (для разнообразия боя).
   Урон, тайминги, хитбоксы и выбор приёма НЕ меняются: стиль только переписывает позу
   (поверх actionPose) и добавляет свои эффекты. Выпадает на точных ударах (perfect/good),
   чаще при груве, без повтора одного стиля подряд.
   pose(P, act, p, k) — k = { s, a, r } ход подготовки/удара/доводки 0..1; fx(g, p, act) — в момент удара.
   ===================================================================== */
const ATTACK_STYLES = {
  // клинок обратным хватом вдоль предплечья, удар с разворота кисти
  reverse: {
    name: "Обратный хват", moves: ["slash1", "slash2", "slash3"],
    pose(P, act) { Object.assign(P, { wBlend: 1, wAngle: Math.PI * 0.92, elbowF: act.phase === "active" ? 0.3 : 0.9, lean: (P.lean || 0) + 0.1, headTilt: 0.15 }); },
    fx(g, p, act) {
      const cy = p.y - 16;
      g.fx.slashArc(p.x + act.dir * 4, cy, 22, act.dir > 0 ? Math.PI * 0.15 : Math.PI * 0.55, act.dir > 0 ? Math.PI * 0.45 : Math.PI * 0.85, "#ffffff", 2, 0.16);
    },
  },
  // разворот на носке во время удара, плащ раскрывается
  pirouette: {
    name: "Пируэт", moves: ["slash1", "slash2", "slash3"],
    pose(P, act, p, k) {
      if (act.phase === "startup") Object.assign(P, { bodyY: -0.6, sy: 1.05 });
      if (act.phase === "active") Object.assign(P, { turn: easeInOut(k.a), cloak: 1.3, armB: -1.5, bodyY: 0.8, legSpread: 1.1 });   // полный оборот
    },
    fx(g, p, act) {
      g.fx.ring(p.x, p.y - 18, 6, 30, p.skin.accent, 0.25, 2);
      g.fx.slashArc(p.x - act.dir * 4, p.y - 20, 22, 0, TAU, rgba(p.skin.accent, 0.6), 2, 0.2);
    },
  },
  // глубокий присед и низкий подрез у самого пола
  low: {
    name: "Подрез", moves: ["slash1", "slash2", "thrust"],
    pose(P, act, p, k) {
      if (act.phase === "startup") Object.assign(P, { bodyY: 2 + 2.8 * easeOut(k.s), legSpread: 1.4 + 0.8 * k.s, lean: 0.45 * k.s, sy: 1 - 0.06 * k.s });
      else if (act.phase === "active") Object.assign(P, { bodyY: 4.6, legSpread: 2.2, lean: 0.5, armF: lerp(-0.2, 1.35, easeOut(k.a)), elbowF: 0.1, sy: 0.93, cloak: -0.8 });
      else Object.assign(P, { bodyY: 4.6 * (1 - easeOut(k.r)), legSpread: 2.2 - 0.9 * k.r, lean: 0.5 * (1 - k.r) });
    },
    fx(g, p, act) {
      const y = p.y - 5, x = p.x + act.dir * 10;
      g.fx.line(x - act.dir * 6, y, x + act.dir * 34, y - 2, p.skin.accent, 3, 0.18);
      g.fx.line(x - act.dir * 6, y, x + act.dir * 34, y - 2, "#ffffff", 1, 0.12);
      g.fx.dust(p.x + act.dir * 8, p.y, 5);
    },
  },
  // клинок подброшен в руке (два оборота) и пойман прямо в удар
  toss: {
    name: "Подброс клинка", moves: ["slash1", "slash3", "thrust"],
    pose(P, act, p, k) {
      if (act.phase === "startup") Object.assign(P, { wBlend: 1, wAngle: TAU * 2 * easeOut(k.s), armF: (P.armF || 0) + 0.5, headTilt: -0.15 });
    },
    fx(g, p, act) {
      const h = CharacterRenderer.handWorld(p, 10);
      g.fx.glow(h.x, h.y, 2, 16, "#ffffff", 0.14, 0.5);
      g.fx.sparks(h.x, h.y, 5, p.skin.accent, 160, -Math.PI / 2, 1.6, 0.25);
    },
  },
  // рывок низким скольжением по полу вместо группировки
  slide: {
    name: "Скольжение", moves: ["dash"],
    pose(P, act) {
      if (act.phase === "travel") Object.assign(P, { tuck: 0, bodyY: 5, lean: -0.38, legSpread: 2.5, sx: 1.08, sy: 0.84, armB: -1.7, cloak: 1.3, headTilt: -0.1 });
    },
    fx(g, p, act) {
      g.fx.line(act.startX, p.y - 1, p.x, p.y - 1, p.skin.accent, 2, 0.3);
      g.fx.dust(p.x, p.y, 8);
    },
  },
  // ствол крутится в руке до и после выстрела
  twirl: {
    name: "Кручение ствола", moves: ["shot", "hip"],
    pose(P, act, p, k) {
      if (act.phase === "startup") Object.assign(P, { wBlend: 1, wAngle: TAU * easeOut(k.s) });
      else if (act.phase === "recovery") Object.assign(P, { wBlend: 1, wAngle: TAU * 2 * easeOut(k.r), armF: lerp(P.armF || 1.2, 1.4, k.r) });
    },
    fx(g, p) { const h = CharacterRenderer.handWorld(p, 8); g.fx.ring(h.x, h.y, 2, 12, "#ffffff", 0.16, 1.5); },
  },
  // выстрел из-под руки, корпус отвёрнут, взгляд в сторону
  under: {
    name: "Из-под руки", moves: ["shot"],
    pose(P) { Object.assign(P, { lean: (P.lean || 0) - 0.28, headTilt: 0.32, armB: 1.3, bodyY: (P.bodyY || 0) + 1, legSpread: 1.5, cloak: 0.6 }); },
    fx() {},
  },
  // выстрел с колена
  kneel: {
    name: "С колена", moves: ["shot", "hip"],
    pose(P) { Object.assign(P, { bodyY: (P.bodyY || 0) + 4.6, legSpread: 2.2, lean: (P.lean || 0) + 0.18, sy: 0.92, cloak: 0.4 }); },
    fx(g, p) { g.fx.dust(p.x, p.y, 5); },
  },
};
const STYLE_IDS = Object.keys(ATTACK_STYLES);

/** Выбор стиля для приёма: только точные удары, чаще при груве, без повтора подряд. null — обычная анимация. */
function pickAttackStyle(cs, name, j) {
  if (j.rating !== "perfect" && j.rating !== "good") return null;
  const ids = STYLE_IDS.filter(id => ATTACK_STYLES[id].moves.includes(name) && id !== cs.lastStyle);
  if (!ids.length || Math.random() > 0.35 + 0.08 * cs.groove) return null;
  const id = pick(ids);
  cs.lastStyle = id;
  cs.styles[id] = (cs.styles[id] || 0) + 1;
  return id;
}
