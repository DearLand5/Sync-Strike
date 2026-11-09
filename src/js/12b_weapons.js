/* =====================================================================
   Арсенал — оружие игрока: ближний бой и огнестрел.
   Оружие меняет характер атак (дальность, скорость, урон, форму удара и выстрела), но не набор приёмов:
   одна кнопка, те же ATTACKS и комбинации. Модификаторы применяются к копии приёма (weaponDef, кэш по оружию),
   поэтому «удар в бит», многоударные приёмы и комбинации работают одинаково с любым оружием.
   Ориентир баланса: урон за нажатие × скорость ≈ как у базового оружия (±10%), сильные стороны компенсируются слабыми.
   Отрисовка силуэтов — WEAPON_DRAW (вызывается из CharacterRenderer._weapon).
   ===================================================================== */

/* Поля mod ближнего боя: reach, st/rc/ac (множители подготовки/восстановления/активной фазы), dmg, knock, stun, lunge,
   jab — обычные удары становятся уколом, fxR/fxW — размер и толщина дуги, lash — росчерк цепи.
   Поля mod огнестрела: dmg, st, rc, speed, knock, stun, pierce, pr (радиус пули), life, muzzle (вынос дула от кисти),
   pellets/range/pspread — дробь (мгновенный залп веером), burst/gap/burstK — очередь, recoil — отдача героя.
   stats — три шкалы карточки 1..5: дальность, скорость, урон. */
const WEAPONS = {
  /* ---------- ближний бой ---------- */
  dagger: { slot: "melee", name: "Теневой кинжал", info: "Быстрый и лёгкий: ровный баланс.", stats: [2, 4, 3], base: true },
  spear: {
    slot: "melee", name: "Ночное копьё", info: "Длинный укол: достаёт издалека, бьёт чуть медленнее.", stats: [5, 3, 3], rangeK: 1.3,
    mod: { reach: 1.5, st: 1.12, rc: 1.1, dmg: 1, knock: 1.05, stun: 1, lunge: 1.1, jab: true },
  },
  glaive: {
    slot: "melee", name: "Лунная глефа", info: "Широкая дуга и тяжёлый удар по группе.", stats: [4, 2, 4], rangeK: 1.18,
    mod: { reach: 1.3, st: 1.22, rc: 1.18, ac: 1.2, dmg: 1, knock: 1.2, stun: 1.1, lunge: 1, fxR: 1.4, fxW: 1.25 },
  },
  kusari: {
    slot: "melee", name: "Цепной серп", info: "Длинная цепь с грузом: бьёт издалека и по дуге, вблизи — серпом.", stats: [5, 3, 2], rangeK: 1.36,
    mod: { reach: 1.6, st: 0.96, rc: 1.1, dmg: 0.95, knock: 0.8, stun: 1, lunge: 0.9, fxR: 1.35, fxW: 0.7, lash: true },
  },
  katana: {
    slot: "melee", name: "Багровая катана", info: "Быстрые чистые разрезы с коротким восстановлением.", stats: [3, 5, 3], rangeK: 1.08,
    mod: { reach: 1.12, st: 0.8, rc: 0.84, dmg: 0.97, knock: 0.8, stun: 0.9, lunge: 1.1, fxR: 1.15, fxW: 0.65 },
  },
  axe: {
    slot: "melee", name: "Боевой топор", info: "Медленный и очень тяжёлый: сильное отбрасывание.", stats: [2, 1, 5], rangeK: 0.94,
    mod: { reach: 0.92, st: 1.3, rc: 1.28, dmg: 1.15, knock: 1.5, stun: 1.25, lunge: 0.85, fxR: 1.1, fxW: 1.5 },
  },
  /* ---------- огнестрел ---------- */
  pistol: { slot: "gun", name: "Неоновый пистолет", info: "Точный и быстрый: ровный баланс.", stats: [4, 4, 2], base: true },
  sawed: {
    slot: "gun", name: "Ржавый обрез", info: "Залп дроби веером: страшен вблизи, на дали слабеет.", stats: [2, 2, 5],
    mod: { dmg: 1.85, st: 1.2, rc: 1.35, speed: 1, knock: 1.5, stun: 1.2, pellets: 5, range: 520, pspread: 0.18, muzzle: 13, recoil: 70 },
  },
  revolver: {
    slot: "gun", name: "Тяжёлый револьвер", info: "Медленный, но каждый выстрел бьёт сильно.", stats: [4, 2, 4],
    mod: { dmg: 1.45, st: 1.25, rc: 1.7, speed: 1.1, knock: 1.7, stun: 1.4, pr: 4.2, muzzle: 11, recoil: 25 },
  },
  smg: {
    slot: "gun", name: "Парные автоматы", info: "Очередь из слабых пуль двумя стволами.", stats: [3, 5, 2],
    mod: { dmg: 1, st: 0.95, rc: 1.12, speed: 1.1, knock: 0.7, stun: 0.8, burst: 3, gap: 0.05, burstK: 1.25, pr: 2.7, muzzle: 9 },
  },
  rail: {
    slot: "gun", name: "Рельсовый карабин", info: "Быстрая пуля навылет: пробивает всех на линии.", stats: [5, 2, 4],
    mod: { dmg: 1.2, st: 1.5, rc: 1.4, speed: 1.55, knock: 1.3, stun: 1.1, pierce: true, pr: 5, life: 1.2, muzzle: 19 },
  },
};
for (const id in WEAPONS) { WEAPONS[id].id = id; WEAPONS[id]._defs = {}; }
const WEAPON_BASE = { melee: "dagger", gun: "pistol" };
const WEAPON_KEY = { melee: "meleeWeapon", gun: "gunWeapon" };
const WEAPON_SLOTS = [{ id: "melee", name: "Ближний бой" }, { id: "gun", name: "Огнестрел" }];

/** Выбранное оружие слота; неизвестный id → базовое. */
function weaponOf(slot, set) {
  const w = WEAPONS[set && set[WEAPON_KEY[slot]]];
  return w && w.slot === slot ? w : WEAPONS[WEAPON_BASE[slot]];
}

/** Приём с поправкой на оружие: копия ATTACKS[name] (создаётся один раз и кэшируется). Базовое оружие — исходный объект. */
function weaponDef(name, set) {
  const base = ATTACKS[name];
  if (base.kit || base.martial) return base;          // приёмы набора оружия (12d_kits) уже настроены под своё оружие
  const w = base.kind === "ranged" ? weaponOf("gun", set) : base.kind === "melee" || base.kind === "dash" ? weaponOf("melee", set) : null;
  if (!w || !w.mod) return base;
  return w._defs[name] || (w._defs[name] = buildWeaponDef(base, w));
}

function buildWeaponDef(base, w) {
  const m = w.mod, d = Object.assign({}, base);
  d.w = w;
  d.startup = base.startup * (m.st || 1);
  d.recovery = base.recovery * (m.rc || 1);
  d.cancel = base.cancel * ((m.st || 1) + (m.rc || 1)) / 2;
  d.dmg = base.dmg * (m.dmg || 1);
  d.knock = base.knock * (m.knock || 1);
  d.stun = base.stun * (m.stun || 1);
  if (w.slot === "melee") {
    d.active = base.active * (m.ac || 1);
    if (base.reach) d.reach = base.reach * (base.spin ? 1 + (m.reach - 1) * 0.5 : m.reach);
    if (base.lunge) d.lunge = base.lunge * (m.lunge || 1);
    if (m.jab && !base.spin && !base.launch && base.kind === "melee") d.thrust = true;   // копьё: обычные удары — уколы
    if (m.fxR) d.fxR = m.fxR;
    if (m.fxW) d.fxW = m.fxW;
    if (m.lash) d.lash = true;
    if (base.name === "Теневой кинжал") d.name = w.name;
  } else {
    if (m.speed) d.speed = base.speed * m.speed;
    if (m.pierce) d.pierce = true;
    if (m.pr) d.pr = m.pr;
    if (m.life) d.life = m.life;
    if (m.muzzle) d.muzzle = m.muzzle;
    if (m.recoil) d.recoil = m.recoil;
    if (m.pellets) {
      // дробь: залп веером считается сразу (мгновенно), dmg — урон всего залпа при попадании всех дробин
      d.pellets = m.pellets; d.range = m.range; d.pspread = m.pspread;
      if (base.spread) d.spread = base.spread * 0.5;      // «Веер»: залпы расходятся меньше обычного
    }
    if (m.burst) {
      // очередь: суммарный урон ≈ burstK × базового, делится на пули; пока не вышли все пули, приём не прерывается
      const sh = base.shots || 1, n = Math.min(6, sh === 1 ? m.burst : sh * 2);
      d.shots = n; d.gap = m.gap; d.burst = true; d.scoreK = 0.45;
      d.dmg = base.dmg * (m.dmg || 1) * m.burstK * sh / n;
      d.active = Math.max(base.active, m.gap * (n - 1) + 0.03);
      d.cancel = Math.max(d.cancel, d.startup + m.gap * (n - 1) + 0.04);
    }
  }
  d.cancel = Math.min(d.cancel, d.startup + d.active + d.recovery);
  return d;
}

/** Пересечение луча с прямоугольником: расстояние до входа или -1 (метод плит). */
function rayBox(x0, y0, dx, dy, b) {
  let t0 = 0, t1 = 1e9;
  if (Math.abs(dx) < 1e-6) { if (x0 < b.x || x0 > b.x + b.w) return -1; }
  else { let a = (b.x - x0) / dx, c = (b.x + b.w - x0) / dx; if (a > c) { const t = a; a = c; c = t; } t0 = Math.max(t0, a); t1 = Math.min(t1, c); }
  if (Math.abs(dy) < 1e-6) { if (y0 < b.y || y0 > b.y + b.h) return -1; }
  else { let a = (b.y - y0) / dy, c = (b.y + b.h - y0) / dy; if (a > c) { const t = a; a = c; c = t; } t0 = Math.max(t0, a); t1 = Math.min(t1, c); }
  return t0 <= t1 ? t0 : -1;
}

/** Поправка позы атаки под оружие (вызывается в конце CombatSystem.actionPose). */
function weaponPose(P, act, p) {
  const w = act.def.w;
  if (!w || act.def.martial) return;
  const tA = act.startup + act.travel;
  if (w.id === "kusari") {
    p.wExt = 0;      // форму цепи задают позы набора (12k_b_blades); без набора — цепь в покое
  } else if (w.id === "glaive" || w.id === "axe") {
    if (act.phase === "active" && !act.def.thrust) { P.bodyY = (P.bodyY || 0) + 0.6; P.legSpread = Math.max(P.legSpread || 1, 1.6); }
  } else if (w.id === "katana") {
    if (act.phase === "active") P.lean = (P.lean || 0) + 0.06;
  } else if (w.id === "smg") {
    if (act.def.kind === "ranged") { P.armB = P.armF; P.legSpread = Math.max(P.legSpread || 1, 1.5); }
  } else if (w.id === "sawed" || w.id === "rail") {
    if (act.def.kind === "ranged") P.lean = (P.lean || 0) - 0.05;
  }
}

/* ---------- отрисовка в руке ---------- */
/* Координаты: ось X — вдоль предплечья/направления оружия, начало — в кисти. off — поворот хвата в покое
   (длинное оружие держат под углом; при прицеливании/уколе wBlend гасит поворот). */
// константы для цикла отрисовки (без аллокаций в кадре)
const WD_SPEAR = [-1, 1, 3], WD_GLAIVE = [-2, 0, 2], WD_KATANA = [-3.8, -2.4, -1], WD_AXE = [-3, -1, 1], WD_RAIL = [8.5, 12, 15.5];
const WD_DASH = [1.1, 0.9], WD_NODASH = [];
const WD_SMG = [[-3.1, -0.8, "#0d0e12"], [0, 0, "#14151b"]];
const wGlow = (ctx, hq, w, col, a) => { if (!hq) return; ctx.globalAlpha *= a; ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke(); ctx.globalAlpha /= a; };
const WEAPON_DRAW = {
  spear: {
    off: -0.95,
    draw(ctx, ch, p, accent, hq) {
      ctx.strokeStyle = "#14151b"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(24, 0); ctx.stroke();
      ctx.strokeStyle = rgba(accent, 0.55); ctx.lineWidth = 0.5;
      ctx.beginPath(); for (const x of WD_SPEAR) { ctx.moveTo(x, -0.9); ctx.lineTo(x + 0.7, 0.9); } ctx.stroke();
      // кисточка под наконечником и листовидный наконечник
      ctx.fillStyle = rgba(accent, 0.7); ctx.beginPath(); ctx.moveTo(22.5, 0); ctx.lineTo(19, 2.6); ctx.lineTo(21, 0.2); ctx.fill();
      ctx.fillStyle = "#1c1d25"; ctx.fillRect(21.6, -1.5, 1, 3);
      ctx.beginPath(); ctx.moveTo(22.4, 0); ctx.quadraticCurveTo(26, -2.9, 33, 0); ctx.quadraticCurveTo(26, 2.9, 22.4, 0); ctx.closePath();
      ctx.fillStyle = "#171820"; ctx.fill();
      ctx.beginPath(); ctx.moveTo(22.4, 0); ctx.quadraticCurveTo(26, -2.9, 33, 0);
      wGlow(ctx, hq, 3, accent, 0.35);
      ctx.strokeStyle = accent; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(23.5, 0); ctx.lineTo(30, 0); ctx.strokeStyle = rgba("#ffffff", 0.18); ctx.lineWidth = 0.35; ctx.stroke();
    },
  },
  glaive: {
    // двусторонняя глефа: длинное древко, хват ПОСЕРЕДИНЕ (начало координат — кисть), изогнутые лезвия на обоих концах.
    // Точечная симметрия (поворот на π даёт тот же силуэт), поэтому лезвие заднего конца рисуется тем же кодом с scale(-1, -1)
    off: -0.75,
    draw(ctx, ch, p, accent, hq) {
      ctx.scale(0.9, 0.9);
      ctx.strokeStyle = "#14151b"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-17, 0); ctx.lineTo(17, 0); ctx.stroke();
      // хват: тёмная оплётка с неоновыми кольцами и небольшие упоры по краям
      ctx.fillStyle = "#0b0c10"; ctx.fillRect(-4.6, -1.3, 9.2, 2.6);
      ctx.fillStyle = rgba(accent, 0.75);
      for (let i = -2; i <= 2; i++) ctx.fillRect(i * 1.8 - 0.25, -1.3, 0.5, 2.6);
      ctx.fillStyle = "#1c1d25"; ctx.fillRect(5, -2, 1, 4); ctx.fillRect(-6, -2, 1, 4);
      for (let s = 1; s >= -1; s -= 2) {
        ctx.save(); ctx.scale(s, s);
        ctx.fillStyle = "#1c1d25"; ctx.fillRect(16, -1.9, 1.4, 3.8);
        // широкий изогнутый клинок («лунный серп»: вперёд и вбок)
        ctx.beginPath(); ctx.moveTo(17, 0.9); ctx.lineTo(18, -1.1); ctx.quadraticCurveTo(25, -3, 30.5, -9.5); ctx.quadraticCurveTo(29.6, -2.6, 24, 1.6); ctx.quadraticCurveTo(20.5, 2.2, 17, 0.9); ctx.closePath();
        ctx.fillStyle = "#171820"; ctx.fill();
        ctx.beginPath(); ctx.moveTo(18, -1.1); ctx.quadraticCurveTo(25, -3, 30.5, -9.5);
        wGlow(ctx, hq, 3.4, accent, 0.35);
        ctx.strokeStyle = accent; ctx.lineWidth = 0.8; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(19.5, 0.2); ctx.quadraticCurveTo(24.5, -0.3, 28.2, -5); ctx.strokeStyle = rgba("#ffffff", 0.16); ctx.lineWidth = 0.35; ctx.stroke();
        ctx.restore();
      }
    },
  },
  kusari: {
    off: -0.6,
    /* Кусаригама: серп в руке и ДЛИННАЯ цепь с грузом (фундо) на его рукояти. Цепь рисуется в «мировых» осях героя
       (x — вперёд по взгляду, y — вниз) от рукояти до груза; положение груза задают позы приёмов (12k_b_blades):
       ch.kuX/kuY — груз относительно кисти (ед. мира), kuB — боковой изгиб (хвост за движением), kuS — провис вниз,
       ch.wExt — доля «боевой» формы 0..1 (0 — в покое цепь висит петлёй с грузом). Без аллокаций, одна обводка на звенья. */
    draw(ctx, ch, p, accent, hq) {
      const ext = ch.wExt || 0;
      // серп: рукоять с кольцом на конце и широкий загнутый клинок
      ctx.fillStyle = "#0b0c10"; ctx.fillRect(-3.4, -0.9, 9.6, 1.8);
      ctx.fillStyle = rgba(accent, 0.6); ctx.fillRect(-2.4, -0.9, 0.4, 1.8); ctx.fillRect(-1, -0.9, 0.4, 1.8); ctx.fillRect(0.4, -0.9, 0.4, 1.8);
      ctx.beginPath(); ctx.arc(-4.3, 0, 1.15, 0, TAU); ctx.strokeStyle = "#8a90a2"; ctx.lineWidth = 0.6; ctx.stroke();
      ctx.fillStyle = "#1c1d25"; ctx.fillRect(5.6, -1.5, 1, 3);
      ctx.beginPath(); ctx.moveTo(6.4, -0.9); ctx.quadraticCurveTo(14.5, -1.6, 14.6, -9.6); ctx.quadraticCurveTo(10.6, -5, 6.4, 1.1); ctx.closePath();
      ctx.fillStyle = "#171820"; ctx.fill();
      ctx.beginPath(); ctx.moveTo(6.4, -0.9); ctx.quadraticCurveTo(14.5, -1.6, 14.6, -9.6);
      wGlow(ctx, hq, 3, accent, 0.35);
      ctx.strokeStyle = accent; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(7.6, -1.3); ctx.quadraticCurveTo(12.4, -2.2, 13.2, -7); ctx.strokeStyle = rgba("#ffffff", 0.16); ctx.lineWidth = 0.35; ctx.stroke();
      // цепь — в осях «вперёд/вниз»: поворачиваем систему так, чтобы убрать наклон корпуса и угол оружия
      const m = ctx.getTransform(), al = Math.atan2(m.b, (ch.facing || 1) * m.a);
      ctx.save(); ctx.rotate(-al);
      const ca = Math.cos(al), sa = Math.sin(al);
      const x0 = -4.3 * ca, y0 = -4.3 * sa;                                      // кольцо рукояти
      // груз: у героя в бою — физическая точка (kusariSim, в ней уже учтена поза приёма через wExt), в превью — по позе
      const S = ch.kuSim, sc = ch.scale || 1;
      let tx, ty;
      if (S && S.ok) { const h = CharacterRenderer.handWorld(ch, 0); tx = (S.x - h.x) * (ch.facing || 1) / sc; ty = (S.y - h.y) / sc; }
      else { tx = lerp(-1.5, ch.kuX == null ? 30 : ch.kuX, ext); ty = lerp(8.5, ch.kuY == null ? 8 : ch.kuY, ext); }
      const dx = tx - x0, dy = ty - y0, len = Math.hypot(dx, dy) || 1;
      // провис: в позе — заданный, свободная цепь — по слабине (длина цепи больше расстояния до груза)
      const slack = S && S.ok ? clamp((S.L / sc - len) * 0.45 + 0.8, 0.5, 9) : 2.5;
      const bend = (ch.kuB || 0) * ext, sag = lerp(slack, ch.kuS || 0, ext);
      // управляющая точка: середина + боковой изгиб + провис (вершина кривой смещена на половину)
      const cx = (x0 + tx) / 2 + (-dy / len) * bend * 2, cy = (y0 + ty) / 2 + (dx / len) * bend * 2 + sag * 2;
      const n = clamp(Math.round(len / 4.4), 4, 44);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, u = 1 - t;
        const px = u * u * x0 + 2 * u * t * cx + t * t * tx, py = u * u * y0 + 2 * u * t * cy + t * t * ty;
        const tgx = 2 * u * (cx - x0) + 2 * t * (tx - cx), tgy = 2 * u * (cy - y0) + 2 * t * (ty - cy), ang = Math.atan2(tgy, tgx);
        const rx = i % 2 ? 1.2 : 2;
        ctx.moveTo(px + Math.cos(ang) * rx, py + Math.sin(ang) * rx);
        ctx.ellipse(px, py, rx, i % 2 ? 0.55 : 1, ang, 0, TAU);
      }
      if (hq) { ctx.globalAlpha *= 0.22; ctx.lineWidth = 2.6; ctx.strokeStyle = accent; ctx.stroke(); ctx.globalAlpha /= 0.22; }
      ctx.strokeStyle = "#9aa1b4"; ctx.lineWidth = 0.7; ctx.stroke();
      // груз (фундо): тёмный шар с неоновой кромкой
      ctx.fillStyle = "#1c1d25"; ctx.beginPath(); ctx.arc(tx, ty, 2.9, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(tx, ty, 2.9, 0, TAU); wGlow(ctx, hq, 3.4, accent, 0.4);
      ctx.strokeStyle = accent; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.beginPath(); ctx.arc(tx - 0.8, ty - 0.8, 0.7, 0, TAU); ctx.fillStyle = rgba("#ffffff", 0.3); ctx.fill();
      ctx.restore();
    },
  },
  katana: {
    off: -0.55,
    draw(ctx, ch, p, accent, hq) {
      // рукоять с оплёткой (ромбы), круглая цуба, слегка изогнутый клинок с хамоном
      ctx.fillStyle = "#0b0c10"; ctx.fillRect(-4.6, -0.95, 5.6, 1.9);
      ctx.fillStyle = rgba(accent, 0.65);
      for (const x of WD_KATANA) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 0.6, -0.9); ctx.lineTo(x + 1.2, 0); ctx.lineTo(x + 0.6, 0.9); ctx.fill(); }
      ctx.fillStyle = "#1c1d25"; ctx.beginPath(); ctx.ellipse(1.4, 0, 0.7, 2.5, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba(accent, 0.7); ctx.lineWidth = 0.4; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1.8, -0.9); ctx.quadraticCurveTo(15, -1.7, 27, -3.6); ctx.lineTo(27.6, -2.6); ctx.quadraticCurveTo(15, 0.2, 1.8, 1); ctx.closePath();
      ctx.fillStyle = "#1a1b23"; ctx.fill();
      ctx.beginPath(); ctx.moveTo(2.5, 0.1); ctx.quadraticCurveTo(15, -0.5, 26, -2.8); ctx.strokeStyle = rgba("#ffffff", 0.2); ctx.lineWidth = 0.35; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1.8, -0.9); ctx.quadraticCurveTo(15, -1.7, 27, -3.6); ctx.lineTo(27.6, -2.6);
      wGlow(ctx, hq, 3, accent, 0.35);
      ctx.strokeStyle = accent; ctx.lineWidth = 0.7; ctx.stroke();
    },
  },
  axe: {
    off: -0.7,
    draw(ctx, ch, p, accent, hq) {
      ctx.strokeStyle = "#17181f"; ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(18, 0); ctx.stroke();
      ctx.strokeStyle = rgba(accent, 0.5); ctx.lineWidth = 0.5;
      ctx.beginPath(); for (const x of WD_AXE) { ctx.moveTo(x, -1); ctx.lineTo(x + 0.7, 1); } ctx.stroke();
      // широкое лезвие-полумесяц и обух
      ctx.beginPath(); ctx.moveTo(13.5, -1); ctx.lineTo(14, -6.5); ctx.quadraticCurveTo(22.5, -8, 23, 0); ctx.quadraticCurveTo(22.5, 8, 14, 6.5); ctx.lineTo(13.5, 1); ctx.closePath();
      ctx.fillStyle = "#1a1b22"; ctx.fill();
      ctx.fillStyle = "#101117"; ctx.fillRect(10.5, -2.2, 3.4, 4.4);
      ctx.beginPath(); ctx.moveTo(14, -6.5); ctx.quadraticCurveTo(22.5, -8, 23, 0); ctx.quadraticCurveTo(22.5, 8, 14, 6.5);
      wGlow(ctx, hq, 3.4, accent, 0.35);
      ctx.strokeStyle = accent; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(17, -4.2); ctx.quadraticCurveTo(20.4, 0, 17, 4.2); ctx.strokeStyle = rgba("#ffffff", 0.16); ctx.lineWidth = 0.4; ctx.stroke();
    },
  },
  sawed: {
    off: 0,
    draw(ctx, ch, p, accent, hq) {
      // два коротких ствола, обрезанный приклад-рукоять
      ctx.fillStyle = "#2a1d17"; ctx.beginPath(); ctx.moveTo(-5, -0.8); ctx.lineTo(-0.5, -1.8); ctx.lineTo(1.5, 0.2); ctx.lineTo(-0.5, 1.4); ctx.lineTo(-4, 4.4); ctx.lineTo(-5.4, 3.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#121318";
      ctx.fillRect(-0.5, -1.9, 4, 3.2);
      ctx.fillStyle = "#1b1c23"; ctx.fillRect(3, -1.7, 11, 1.5); ctx.fillRect(3, -0.05, 11, 1.5);
      ctx.fillStyle = "#3a2a1e"; ctx.fillRect(3.5, 1.4, 4.5, 1.2);          // цевьё
      ctx.fillStyle = accent; ctx.fillRect(13.2, -1.7, 0.8, 1.5); ctx.fillRect(13.2, -0.05, 0.8, 1.5);
      ctx.fillStyle = rgba(accent, 0.55); ctx.fillRect(0.6, -2.3, 2.4, 0.5);
    },
  },
  revolver: {
    off: 0,
    draw(ctx, ch, p, accent, hq) {
      ctx.fillStyle = "#101117";
      ctx.beginPath(); ctx.moveTo(-1.5, -1.5); ctx.lineTo(4, -1.7); ctx.lineTo(4, 1.2); ctx.lineTo(1.2, 1.4); ctx.lineTo(-0.2, 4.6); ctx.lineTo(-2.4, 4.4); ctx.lineTo(-1.4, 1.3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#1a1b22"; ctx.fillRect(4, -1.6, 7.6, 1.5);          // ствол
      ctx.fillRect(4, -0.2, 6.5, 0.8);                                      // подствольная тяга
      ctx.fillStyle = "#16171d"; ctx.beginPath(); ctx.ellipse(3.3, -0.4, 1.9, 2.2, 0, 0, TAU); ctx.fill();   // барабан
      ctx.strokeStyle = accent; ctx.lineWidth = 0.5; ctx.stroke();
      ctx.fillStyle = "#2b1f18"; ctx.fillRect(-2.2, 1.6, 1.8, 2.8);        // накладка рукояти
      ctx.fillStyle = accent; ctx.fillRect(11, -1.7, 0.8, 1.5); ctx.fillRect(-1.3, -2.3, 1.2, 0.9);
    },
  },
  smg: {
    off: 0,
    draw(ctx, ch, p, accent, hq) {
      // два компактных автомата: дальний (выше, темнее) и ближний
      for (const [oy, ox, c] of WD_SMG) {
        ctx.fillStyle = c;
        ctx.fillRect(ox - 1.5, oy - 1.3, 8.5, 2.5);                          // кожух
        ctx.fillRect(ox + 7, oy - 0.9, 3, 0.8);                              // ствол
        ctx.fillRect(ox - 0.4, oy + 1.1, 1.7, 2.8);                          // рукоять
        ctx.fillRect(ox + 3.2, oy + 1.1, 1.4, 3.4);                          // магазин
        ctx.fillStyle = accent; ctx.fillRect(ox + 1, oy - 0.7, 4, 0.5);
        ctx.fillRect(ox + 9.6, oy - 1, 0.7, 1);
      }
    },
  },
  rail: {
    off: 0,
    draw(ctx, ch, p, accent, hq) {
      // приклад, корпус с накопителем, две светящиеся направляющие
      ctx.fillStyle = "#101117"; ctx.fillRect(-6, -1.2, 3.2, 2.6); ctx.fillRect(-3, -1.6, 9.5, 3);
      ctx.fillRect(0.4, 1.3, 1.8, 3.2);                                      // рукоять
      ctx.fillStyle = "#1a1b22"; ctx.fillRect(6.5, -1.6, 13, 0.9); ctx.fillRect(6.5, 0.1, 13, 0.9);
      ctx.fillStyle = accent; ctx.fillRect(7, -1.4, 12, 0.35); ctx.fillRect(7, 0.3, 12, 0.35);
      ctx.fillStyle = "#1c1d25"; for (const x of WD_RAIL) ctx.fillRect(x, -2.1, 0.9, 3.7);   // катушки
      ctx.fillStyle = rgba(accent, 0.55); ctx.fillRect(-1.5, -2.5, 4, 0.7);
      if (hq) { ctx.globalAlpha *= 0.4; ctx.fillStyle = accent; ctx.fillRect(7, -1.9, 12, 0.5); ctx.fillRect(7, 0, 12, 0.5); ctx.globalAlpha /= 0.4; }
    },
  },
};

/** Физика груза кусаригамы (герой в бою): точка на цепи-верёвке с инерцией, гравитацией и полом. Поза приёма задаёт груз
 *  через p.kuX/kuY и долю p.wExt: при wExt = 1 груз идёт точно по позе (скорость точки — движение позы), при 0 — свободно
 *  летит и висит на цепи длиной p.kuLen (её длина меняется плавно — цепь выбирается и отпускается, а не дёргается).
 *  Так переход «бросок → свободный хлыст → втягивание» непрерывен, а в беге и прыжке груз отстаёт и качается.
 *  Вызывается раз в кадр после позы (Player._pose); подшаги 1/120 — результат не зависит от частоты кадров. */
function kusariSim(p, dt) {
  const h = CharacterRenderer.handWorld(p, 0), sc = p.scale || 1;
  let S = p.kuSim;
  if (!S) S = p.kuSim = { x: h.x, y: h.y + 9 * sc, px: h.x, py: h.y + 9 * sc, L: 9 * sc, ok: false };
  if (!S.ok || Math.hypot(S.x - h.x, S.y - h.y) > 400) { S.x = S.px = h.x - p.facing * 1.5 * sc; S.y = S.py = h.y + 8.5 * sc; S.L = 9 * sc; }
  S.ok = true;
  const ext = clamp(p.wExt || 0, 0, 1);
  const ex = h.x + (p.kuX || 0) * p.facing * sc, ey = h.y + (p.kuY || 0) * sc;
  const floor = (p.groundY == null ? 0 : p.groundY) - 2;
  const n = clamp(Math.round(dt * 120), 1, 8), hs = dt / n, Lw = (p.kuLen || 9) * sc;
  // толчок груза (хлёст на ударе серпом): скорость, ед./с
  if (p.kuKick) { S.px = S.x - p.kuKick[0] * sc * hs; S.py = S.y - p.kuKick[1] * sc * hs; p.kuKick = null; }
  for (let i = 0; i < n; i++) {
    const vx = (S.x - S.px) * 0.988, vy = (S.y - S.py) * 0.988;
    S.px = S.x; S.py = S.y;
    S.x += vx; S.y += vy + 1500 * hs * hs;
    // длина цепи: пока груз в позе — не короче расстояния до него; свободно — плавно к нужной
    const d0 = Math.hypot(S.x - h.x, S.y - h.y);
    S.L = ext > 0.02 ? Math.max(S.L + (Lw - S.L) * Math.min(1, hs * 6), Math.min(d0, 175 * sc)) : S.L + (Lw - S.L) * Math.min(1, hs * 7);
    const d = Math.hypot(S.x - h.x, S.y - h.y);
    if (d > S.L && d > 1e-3) { const k = S.L / d; S.x = h.x + (S.x - h.x) * k; S.y = h.y + (S.y - h.y) * k; }
    if (S.y > floor) { S.y = floor; S.px = S.x - (S.x - S.px) * 0.6; S.py = S.y; }    // груз по полу — трение
    if (ext > 0) { S.x = lerp(S.x, ex, ext); S.y = lerp(S.y, ey, ext); }
  }
}

/** Кадр героя с оружием на канвасе size×size (для карточек «Арсенала» и контактного листа). act — "idle" | "strike". */
function drawWeaponPreview(c, id, skin, size, act = "idle") {
  const w = WEAPONS[id], gun = w.slot === "gun";
  const gr = c.createLinearGradient(0, 0, 0, size);
  gr.addColorStop(0, "#0d0e14"); gr.addColorStop(1, mixHex("#0d0e14", skin.accent, 0.15));
  c.fillStyle = gr; c.fillRect(0, 0, size, size);
  c.fillStyle = rgba(skin.accent, 0.6); c.fillRect(0, size * 0.9, size, 1.5);
  const ch = { kind: "player", skin, x: size * 0.3, y: size * 0.9, facing: 1, scale: size / 62, anim: new AnimState(), scarfColor: skin.scarf, weapon: id, eyeBoost: 0.3, flash: 0, groundY: size * 0.9, vx: 0, vy: 0, wExt: 0 };
  const P = ch.anim.pose;
  if (gun) Object.assign(P, { armF: 1.45, elbowF: 0.05, lean: -0.04, armB: 0.3, wAngle: 0, wBlend: 0 });
  else if (act === "strike") Object.assign(P, id === "spear" ? { armF: Math.PI / 2, elbowF: 0, wBlend: 1, wAngle: 0, lean: 0.4, legSpread: 1.7 } : { armF: 1.9, elbowF: 0.1, lean: 0.25, legSpread: 1.6 });
  else Object.assign(P, { armF: 0.55, elbowF: 0.5, lean: 0.05 });
  if (id === "kusari") { ch.wExt = act === "strike" ? 1 : 0; ch.kuX = 23; ch.kuY = 6; ch.kuB = -4; ch.kuS = 5; }     // на карточке цепь короче: груз у края кадра
  if (id === "smg") P.armB = 1.45;
  if (WEAPON_DRAW[id] && WEAPON_DRAW[id].preview) WEAPON_DRAW[id].preview(P, ch, act);     // свой вид на карточке (вторая рука, подвижные части)
  CharacterRenderer.draw(c, ch);
}
