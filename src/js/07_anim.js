/* =====================================================================
   AnimationSystem + CharacterRenderer + скины.
   Персонажи процедурные: поза — набор параметров, которые плавно
   смешиваются; плащ и шарф — пружины с инерцией. Локальные координаты:
   ноги в (0,0), взгляд вправо, y вниз, рост ≈ 40 единиц.
   ===================================================================== */
/* Скин игрока: head — украшение головы, hem — подол плаща, mark — знак на груди,
   back — снаряжение на спине, wide — ширина плаща, rim — контровой свет на тёмной маске,
   cat/from — категория и вдохновение для экрана «Облик», mono — один глаз, noEyes — без глаз (голова — свет). Новые скины и их детали — 07b_skins.js. */
const SKINS = {
  shade:   { cat: "classic", from: "исходный образ", name: "Тень",    mask: "#e8e2d6", eye: "#06070a", accent: "#3ef0ff", cloak: "#07080c", head: "horns",   scarf: "#3ef0ff", hem: "jag",      mark: "rune",   back: null },
  ronin:   { cat: "classic", from: "самурайское кино", name: "Ронин",   mask: "#1b1c22", eye: "#ff2d4a", accent: "#ff2d4a", cloak: "#0b0708", head: "hat",     scarf: "#ff2d4a", hem: "straight", mark: "sash",   back: "katana", wide: 1.1,  rim: true },
  specter: { cat: "classic", from: "призрак, дух", name: "Призрак", mask: "#f3f0ff", eye: "#2b1a66", accent: "#b18cff", cloak: "#0a0812", head: "hood",    scarf: null,      hem: "wisp",     mark: "moon",   back: null },
  volt:    { cat: "classic", from: "электрик, аркады", name: "Вольт",   mask: "#101116", eye: "#ffe34a", accent: "#ffe34a", cloak: "#0b0a06", head: "antenna", scarf: "#ffe34a", hem: "angular",  mark: "bolt",   back: "pack",   rim: true },
  sakura:  { cat: "classic", from: "аниме, сакура", name: "Сакура",  mask: "#ffe6f0", eye: "#1a0a12", accent: "#ff5fb0", cloak: "#0d070a", head: "bow",     scarf: "#ff5fb0", hem: "scallop",  mark: "petals", back: "obi" },
  moth:    { cat: "classic", from: "ночной мотылёк", name: "Мотылёк", mask: "#d7f7e8", eye: "#08140f", accent: "#3dffa8", cloak: "#060b09", head: "antlers", scarf: null,      hem: "fork",     mark: "eyes",   back: "wings" },
};

/** Облик врагов: телосложение и варианты снаряжения (hem — подол, back — снаряжение на спине). */
const ENEMY_LOOKS = {
  blade:  { accent: "#ff2e88", scale: 1.0,  legLen: 8,  hunch: 0.28, coat: 1.0, weapon: "knives", hem: "jag",      back: "sheath", heads: ["hood", "band", "mask"], cloth: ["#0a0609", "#0d0709", "#080608"] },
  gunner: { accent: "#ffb13b", scale: 1.08, legLen: 11, hunch: 0.04, coat: 1.35, weapon: "rifle", hem: "straight", back: null,     heads: ["helmet", "hood", "band"], cloth: ["#0a0907", "#0b0a08", "#080807"] },
  swift:  { accent: "#b6ff3b", scale: 0.82, legLen: 8,  hunch: 0.35, coat: 0.7, weapon: "claw",  hem: "jag",      back: null,     heads: ["band", "spike", "mask"], cloth: ["#070a06", "#080b07", "#060806"] },
  brute:  { accent: "#9b6bff", scale: 1.55, legLen: 9,  hunch: 0.18, coat: 1.1, weapon: "hammer", hem: "plates",  back: null,     heads: ["helmet", "spike", "horns"], cloth: ["#09070d", "#0a080e", "#08070b"] },
};

const BASE_POSE = {
  bodyY: 0, sx: 1, sy: 1, lean: 0, legPhase: 0, legAmp: 0, legSpread: 1, tuck: 0,
  armF: 0.35, elbowF: 0.4, armB: -0.3, wAngle: 0, wBlend: 0, headTilt: 0, cloak: 0, eye: 0, spin: 0,
};

class AnimState {
  constructor() {
    this.pose = Object.assign({}, BASE_POSE);
    this.cloak = 0; this.cloakV = 0;       // пружина подола плаща
    this.scarf = null;                     // цепочка точек шарфа (мировые координаты)
    this.squashT = 0;                      // импульс сплющивания (приземление, удар)
  }
}

const AnimationSystem = {
  /** Плавное смешивание текущей позы к целевой. rate — скорость (1/с). */
  blend(st, target, rate, dt) {
    const p = st.pose;
    const k = 1 - Math.exp(-rate * dt);
    for (const key in target) {
      const v = target[key];
      if (typeof v === "number") p[key] = key === "legPhase" || key === "spin" ? v : p[key] + (v - p[key]) * k;
      else p[key] = v;
    }
    // вращение (кувырки, сальто) задаётся напрямую — плавный возврат дал бы обратный оборот
    if (target.spin == null) p.spin = 0;
  },
  /** Вторичная анимация с подшагами 1/120 с — результат не зависит от частоты кадров. */
  secondary(st, ch, dt) {
    const n = clamp(Math.round(dt * 120), 1, 8), h = dt / n;
    for (let i = 0; i < n; i++) this._secondary(st, ch, h);
  },
  /** Плащ отстаёт от движения, шарф — цепочка Верле. */
  _secondary(st, ch, dt) {
    const target = clamp(-ch.vx * 0.012 * ch.facing, -1.2, 0.6) + (ch.vy < -50 ? -0.3 : ch.vy > 80 ? 0.35 : 0) + st.pose.cloak;
    st.cloakV += ((target - st.cloak) * 180 - st.cloakV * 16) * dt;
    st.cloak += st.cloakV * dt;
    st.squashT = Math.max(0, st.squashT - dt * 6);
    if (ch.scarfColor) {
      const s = ch.scale, n = 6, seg = 4.2 * s;
      const ax = ch.x - ch.facing * 1.5 * s, ay = ch.y + (-18.5 + st.pose.bodyY) * s;
      if (!st.scarf) { st.scarf = []; for (let i = 0; i < n; i++) st.scarf.push({ x: ax - ch.facing * i * seg, y: ay, px: ax - ch.facing * i * seg, py: ay }); }
      const pts = st.scarf;
      pts[0].x = ax; pts[0].y = ay; pts[0].px = ax; pts[0].py = ay;
      const wind = -ch.facing * 30 - ch.vx * 0.3;
      for (let i = 1; i < n; i++) {
        const p = pts[i];
        const vx = (p.x - p.px) * 0.9, vy = (p.y - p.py) * 0.9;
        p.px = p.x; p.py = p.y;
        p.x += vx + wind * dt * dt * 60;
        p.y += vy + 220 * dt * dt + Math.sin(performance.now() / 160 + i) * 0.05;
      }
      for (let it = 0; it < 3; it++) {
        for (let i = 1; i < n; i++) {
          const a = pts[i - 1], b = pts[i];
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
          const diff = (d - seg) / d;
          b.x -= dx * diff; b.y -= dy * diff;
        }
      }
    }
  },
};

/** Точки скелета в локальных координатах (для боя: рука, дуло, клинок). */
function rigJoints(p, legLen = 8, hunch = 0) {
  const hipY = -(legLen + 1) + p.bodyY;
  const lean = p.lean + hunch;
  const rot = (x, y) => {
    const dy = y - hipY;
    return { x: x * Math.cos(lean) - dy * Math.sin(lean), y: hipY + x * Math.sin(lean) + dy * Math.cos(lean) };
  };
  const sh = rot(1, hipY - 9.5);
  const ex = sh.x + Math.sin(p.armF) * 6, ey = sh.y + Math.cos(p.armF) * 6;
  const hx = ex + Math.sin(p.armF + p.elbowF) * 6, hy = ey + Math.cos(p.armF + p.elbowF) * 6;
  return { hipY, sh, elbow: { x: ex, y: ey }, hand: { x: hx, y: hy }, head: rot(0.8, hipY - 17.5), rot };
}

/** mixHex с кэшем: в отрисовке цвета повторяются каждый кадр, строки не пересобираем. */
const _mixMemo = new Map();
function mixc(a, b, t) {
  const k = a + b + t;
  let v = _mixMemo.get(k);
  if (v === undefined) { v = mixHex(a, b, t); _mixMemo.set(k, v); }
  return v;
}

const CharacterRenderer = {
  quality: "high",

  /**
   * ch: { x, y, facing, scale, anim, skin|look, kind, flash, alpha, eyeBoost, variant }
   * opts.tint — нарисовать одноцветной тенью (остаточное изображение)
   */
  draw(ctx, ch, opts = {}) {
    const st = ch.anim, p = st.pose;
    const look = ch.kind === "player" ? null : ENEMY_LOOKS[ch.kind];
    const skin = ch.kind === "player" ? ch.skin : null;
    const legLen = look ? look.legLen : 8, hunch = look ? look.hunch : 0;
    const accent = skin ? skin.accent : look.accent;
    const tint = opts.tint || null;
    const ink = tint || (skin ? skin.cloak : look.cloth[ch.variant % look.cloth.length]);
    const maskC = tint || (skin ? skin.mask : "#121218");
    const hq = this.quality === "high" && !tint;
    const s = ch.scale;
    const hemStyle = skin ? skin.hem : look.hem;
    const back = skin ? skin.back : look.back;

    ctx.save();
    ctx.translate(ch.x, ch.y);
    ctx.globalAlpha *= ch.alpha == null ? 1 : ch.alpha;
    // тень под ногами
    if (!tint && ch.groundY != null) {
      const h = clamp((ch.groundY - ch.y) / 120, 0, 1);
      ctx.fillStyle = rgba(accent, 0.18 * (1 - h));
      ctx.beginPath(); ctx.ellipse(0, ch.groundY - ch.y, 10 * s * (1 - h * 0.5), 2.2 * s, 0, 0, TAU); ctx.fill();
    }
    // --- шарф (за телом, в мировых координатах): ленточка сужается к концу ---
    if (!tint && ch.scarfColor && st.scarf) {
      ctx.save();
      ctx.translate(-ch.x, -ch.y);
      const pts = st.scarf, n = pts.length;
      const edge = (i, sg) => {
        const a = pts[i > 0 ? i - 1 : 0], b = pts[i < n - 1 ? i + 1 : n - 1];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
        const w = (1.5 * (1 - i / (n - 1) * 0.75) + 0.25) * s * sg / d;
        return [pts[i].x - dy * w, pts[i].y + dx * w];
      };
      ctx.beginPath();
      for (let i = 0; i < n; i++) { const e = edge(i, 1); i ? ctx.lineTo(e[0], e[1]) : ctx.moveTo(e[0], e[1]); }
      for (let i = n - 1; i >= 0; i--) { const e = edge(i, -1); ctx.lineTo(e[0], e[1]); }
      ctx.closePath();
      ctx.fillStyle = ch.scarfColor; ctx.strokeStyle = ch.scarfColor;
      if (hq) { ctx.globalAlpha *= 0.28; ctx.lineWidth = 2.6 * s; ctx.stroke(); ctx.globalAlpha /= 0.28; }
      ctx.fill();
      // световая жилка по центру
      ctx.beginPath();
      pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.strokeStyle = rgba("#ffffff", 0.4); ctx.lineWidth = 0.5 * s; ctx.stroke();
      // узел у шеи
      ctx.fillStyle = ch.scarfColor; ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, 1.5 * s, 0, TAU); ctx.fill();
      ctx.restore();
    }
    const sq = st.squashT;
    ctx.scale(s * ch.facing * p.sx * (1 + sq * 0.18), s * p.sy * (1 - sq * 0.16));
    // кувырки и сальто — вращение вокруг центра тела
    if (p.spin) { ctx.translate(0, -14); ctx.rotate(p.spin); ctx.translate(0, 14); }
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const J = rigJoints(p, legLen, hunch);
    const hipY = J.hipY;
    // неоновый ореол за силуэтом — чтобы тёмная фигура читалась на тёмном фоне
    if (!tint) {
      const ar = 24, ay = hipY - 7;
      const ga = (hq ? 0.16 : 0.1) + 0.2 * (ch.eyeBoost || 0);
      const gr = ctx.createRadialGradient(0, ay, 2, 0, ay, ar);
      gr.addColorStop(0, rgba(accent, ga)); gr.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = gr; ctx.fillRect(-ar, ay - ar, ar * 2, ar * 2);
    }

    // --- ноги ---
    const legs = [-1, 1], brute = ch.kind === "brute";
    for (const side of legs) {
      const ph = p.legPhase + (side > 0 ? 0 : Math.PI);
      const fx = side * 2.2 * p.legSpread + Math.sin(ph) * p.legAmp * 5;
      const lift = Math.max(0, -Math.cos(ph)) * p.legAmp * 3 + p.tuck * 5;
      const fy = -lift;
      const hx = side * 1.8;
      ctx.beginPath();
      ctx.moveTo(hx, hipY + 1);
      ctx.quadraticCurveTo(hx + (fx - hx) * 0.5 + 1.8, (hipY + fy) * 0.5, fx, fy);
      const legC = side > 0 ? ink : mixc(ink, "#000000", 0.4);
      ctx.strokeStyle = legC;
      ctx.lineWidth = brute ? 3.6 : 2.6;
      ctx.stroke();
      // ботинок с носком
      ctx.fillStyle = legC;
      ctx.beginPath(); ctx.ellipse(fx + 0.9, fy - 0.6, brute ? 2.8 : 2.0, 1.15, 0, 0, TAU); ctx.fill();
      if (!tint) {
        // поножа у колена у брута, неоновая кромка ботинка у ближней ноги
        if (brute) { ctx.fillStyle = side > 0 ? "#181720" : "#100f16"; ctx.fillRect(hx + (fx - hx) * 0.45 - 1.6, (hipY + fy) * 0.52 - 1.3, 3.4, 2.4); }
        if (side > 0) { ctx.fillStyle = rgba(accent, 0.65); ctx.fillRect(fx + 0.6, fy - 0.2, brute ? 3 : 2.3, 0.55); }
      }
    }

    // --- корпус и плащ (с наклоном вокруг бедра) ---
    ctx.save();
    ctx.translate(0, hipY);
    ctx.rotate(p.lean + hunch);
    ctx.translate(0, -hipY);
    const coat = look ? look.coat : 1;
    const shoulderY = hipY - 9.5;
    const hemY = hipY + 2 + (coat - 1) * 7;
    const fl = st.cloak * 5;
    const wide = brute ? 1.35 : (skin && skin.wide) || 1;
    // задняя рука
    this._arm(ctx, p.armB, 0.5, shoulderY, mixc(ink, "#000000", 0.4), wide, null);
    // снаряжение позади плаща (ножны, крылья, батарея)
    if (!tint && back) this._backGear(ctx, back, 0, accent, wide, shoulderY, hipY, hemY, fl, hq);
    // подкладка плаща — второй слой, чуть шире и с оттенком неона
    if (!tint) {
      ctx.beginPath();
      ctx.moveTo(-3.2 * wide, shoulderY + 1);
      ctx.quadraticCurveTo(-7 * wide + fl * 0.6, hipY - 3, -8.6 * wide + fl * 1.15, hemY + 2.2);
      ctx.lineTo(-4 * wide + fl * 0.6, hemY + 1);
      ctx.closePath();
      ctx.fillStyle = mixc(ink, accent, 0.16); ctx.fill();
    }
    // плащ
    ctx.beginPath();
    ctx.moveTo(-3.6 * wide, shoulderY);
    ctx.lineTo(3.4 * wide, shoulderY);
    ctx.quadraticCurveTo(6.2 * wide, hipY - 3, 6.5 * wide + fl * 0.3, hemY);
    this._hem(ctx, hemStyle, 6.5 * wide + fl * 0.3, -7.5 * wide + fl, hemY);
    ctx.quadraticCurveTo(-6 * wide + fl * 0.4, hipY - 4, -3.6 * wide, shoulderY);
    ctx.closePath();
    ctx.fillStyle = ink; ctx.fill();
    if (!tint) {
      ctx.strokeStyle = rgba(accent, 0.28); ctx.lineWidth = 0.6; ctx.stroke();
      // складки
      ctx.strokeStyle = mixc(ink, "#ffffff", 0.07); ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(-1 * wide, shoulderY + 2); ctx.quadraticCurveTo(-2 * wide + fl * 0.3, hipY - 2, -3 * wide + fl * 0.6, hemY);
      ctx.moveTo(2 * wide, shoulderY + 2); ctx.quadraticCurveTo(2.6 * wide, hipY - 2, 3 * wide + fl * 0.2, hemY);
      ctx.stroke();
      this._marks(ctx, ch.kind, accent, wide, shoulderY, hipY, hemY, skin);
      // пояс с развевающимся концом
      ctx.strokeStyle = rgba(accent, 0.75); ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(-4.4 * wide, hipY - 2.5); ctx.quadraticCurveTo(0, hipY - 1.6, 4.8 * wide, hipY - 2.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-4.2 * wide, hipY - 2.4); ctx.quadraticCurveTo(-6 * wide + fl * 0.5, hipY, -7 * wide + fl, hipY + 2 + Math.sin(performance.now() / 140 + ch.x) * 0.8); ctx.stroke();
      if (back) this._backGear(ctx, back, 1, accent, wide, shoulderY, hipY, hemY, fl, hq);
      // неоновый контровой свет по заднему краю плаща
      ctx.beginPath();
      ctx.moveTo(-3.6 * wide, shoulderY + 1);
      ctx.quadraticCurveTo(-6 * wide + fl * 0.4, hipY - 4, -7.5 * wide + fl, hemY + 1);
      ctx.strokeStyle = rgba(accent, 0.55 + 0.45 * ch.eyeBoost);
      ctx.lineWidth = 1.1;
      if (hq) { ctx.globalAlpha *= 0.3; ctx.lineWidth = 3.4; ctx.stroke(); ctx.globalAlpha /= 0.3; ctx.lineWidth = 1.1; }
      ctx.stroke();
    }
    // голова
    ctx.save();
    ctx.translate(0.8, hipY - 17.5);
    ctx.rotate(p.headTilt);
    this._head(ctx, ch, skin, look, maskC, accent, tint, hq);
    ctx.restore();
    // передняя рука и оружие
    this._arm(ctx, p.armF, p.elbowF, shoulderY, ink, wide, tint ? null : accent);
    if (!tint) this._weapon(ctx, ch, p, J, accent, hq);
    ctx.restore();

    ctx.restore();
    // вспышка попадания — белый силуэт поверх
    if (ch.flash > 0 && !tint) {
      ctx.save();
      ctx.globalAlpha *= clamp(ch.flash, 0, 1) * 0.9;
      this.draw(ctx, ch, { tint: "#ffffff" });
      ctx.restore();
    }
  },

  /** Рука из двух звеньев; brace — цвет неонового наруча у запястья (null — без него). */
  _arm(ctx, a, elbow, shoulderY, color, wide, brace) {
    const sx = 1, sy = shoulderY + 0.5;
    const ex = sx + Math.sin(a) * 6, ey = sy + Math.cos(a) * 6;
    const hx = ex + Math.sin(a + elbow) * 6, hy = ey + Math.cos(a + elbow) * 6;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy);
    ctx.strokeStyle = color; ctx.lineWidth = 2.2 * wide; ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(hx, hy, 1.5 * wide, 0, TAU); ctx.fill();
    if (brace) {
      ctx.beginPath();
      ctx.moveTo(ex + (hx - ex) * 0.5, ey + (hy - ey) * 0.5); ctx.lineTo(ex + (hx - ex) * 0.78, ey + (hy - ey) * 0.78);
      ctx.lineCap = "butt"; ctx.strokeStyle = rgba(brace, 0.7); ctx.lineWidth = 2.2 * wide + 0.5; ctx.stroke();
      ctx.lineCap = "round";
    }
  },

  /** Подол плаща: путь от правого угла (xr) к левому (xl) на высоте y. */
  _hem(ctx, style, xr, xl, y) {
    const at = t => lerp(xr, xl, t);
    switch (style) {
      case "jag":      // рваный
        for (let i = 1; i <= 4; i++) ctx.lineTo(at(i / 4) + 1, y + (i % 2 ? 2.5 : 0));
        break;
      case "wisp":     // длинные призрачные лоскуты
        ctx.lineTo(at(0.12), y + 1.2); ctx.lineTo(at(0.3), y + 5.5); ctx.lineTo(at(0.46), y + 0.8);
        ctx.lineTo(at(0.64), y + 7); ctx.lineTo(at(0.8), y + 1); ctx.lineTo(at(0.95), y + 4); ctx.lineTo(xl, y + 0.5);
        break;
      case "scallop":  // фестон лепестками
        for (let i = 0; i < 4; i++) ctx.quadraticCurveTo(at((i + 0.5) / 4), y + 3.6, at((i + 1) / 4), y + 0.6);
        break;
      case "fork":     // ласточкин хвост
        ctx.lineTo(at(0.08), y + 5); ctx.lineTo(at(0.42), y - 0.4); ctx.lineTo(at(0.64), y + 6.4); ctx.lineTo(at(0.8), y + 0.4); ctx.lineTo(xl, y + 2);
        break;
      case "angular":  // зигзаг
        ctx.lineTo(at(0.25), y + 3.4); ctx.lineTo(at(0.5), y + 0.4); ctx.lineTo(at(0.75), y + 3.4); ctx.lineTo(xl, y + 0.8);
        break;
      case "plates":   // пластины набедренника
        for (let i = 0; i < 3; i++) { ctx.lineTo(at((i + 0.9) / 3), y + 2); ctx.lineTo(at((i + 1) / 3), y + 0.2); }
        break;
      default: { const f = HEM_PARTS[style]; if (f) f(ctx, xr, xl, y); else ctx.lineTo(xl, y + 1); }
    }
  },

  /** Снаряжение на теле. layer 0 — позади плаща, 1 — поверх него. */
  _backGear(ctx, type, layer, accent, wide, shoulderY, hipY, hemY, fl, hq) {
    const bp = BACK_PARTS[type];
    if (bp) {
      const f = layer ? bp.front : bp.back;
      if (f) {
        const G = SKIN_G;
        G.accent = accent; G.wide = wide; G.shoulderY = shoulderY; G.hipY = hipY; G.hemY = hemY; G.fl = fl; G.hq = hq; G.now = performance.now();
        f(ctx, G);
      }
      return;
    }
    if (layer === 0) {
      if (type === "sheath") {
        // перекрёстные ножны за спиной: рукоять торчит над плечом, кончик выглядывает у бедра
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(-7.2, shoulderY - 5.6); ctx.lineTo(7.4, hipY + 0.6);
        ctx.strokeStyle = "#1a1b22"; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-7.2, shoulderY - 5.6); ctx.lineTo(-9, shoulderY - 7.9);
        ctx.strokeStyle = "#0a0a0e"; ctx.lineWidth = 1.9; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-8.4, shoulderY - 4.6); ctx.lineTo(-6, shoulderY - 6.6);   // гарда
        ctx.strokeStyle = rgba(accent, 0.85); ctx.lineWidth = 0.7; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(6.6, hipY + 0.2); ctx.lineTo(7.9, hipY + 0.8);
        ctx.strokeStyle = rgba(accent, 0.9); ctx.lineWidth = 1.1; ctx.stroke();
      } else if (type === "wings") {
        // крылья мотылька: трепещут, на верхнем — глазок
        const fw = fl * 0.5 + Math.sin(performance.now() / 260) * 0.7;
        ctx.beginPath();
        ctx.moveTo(-2.4, shoulderY + 1); ctx.quadraticCurveTo(-9 * wide + fw, shoulderY - 9, -14.5 + fw, shoulderY - 5.4);
        ctx.quadraticCurveTo(-13 + fw, hipY - 5, -3, hipY - 5); ctx.closePath();
        ctx.fillStyle = mixc("#060b09", accent, 0.13); ctx.fill();
        ctx.strokeStyle = rgba(accent, 0.6); ctx.lineWidth = 0.7; ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-2.4, shoulderY + 3.5); ctx.quadraticCurveTo(-12.5 + fw, hipY - 7, -11.5 + fw * 1.2, hipY + 4.2);
        ctx.quadraticCurveTo(-6.5, hipY + 3, -3, hipY - 3); ctx.closePath();
        ctx.fillStyle = mixc("#060b09", accent, 0.1); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(-9.4 + fw, shoulderY - 3.2, 1.5, 0, TAU);
        ctx.strokeStyle = rgba(accent, 0.7); ctx.lineWidth = 0.6; ctx.stroke();
        ctx.fillStyle = rgba(accent, 0.55); ctx.beginPath(); ctx.arc(-9.4 + fw, shoulderY - 3.2, 0.6, 0, TAU); ctx.fill();
      } else if (type === "pack") {
        // батарейный блок за спиной
        ctx.fillStyle = "#14151b"; ctx.fillRect(-6.6, shoulderY + 1.2, 3.8, 6.6);
        ctx.strokeStyle = rgba(accent, 0.75); ctx.lineWidth = 0.6; ctx.strokeRect(-6.6, shoulderY + 1.2, 3.8, 6.6);
        ctx.fillStyle = accent; ctx.fillRect(-5.6, shoulderY + 2.6, 1.8, 0.8); ctx.fillRect(-5.6, shoulderY + 4.4, 1.8, 0.8);
        ctx.beginPath(); ctx.moveTo(-3, shoulderY + 2.5); ctx.quadraticCurveTo(-1, shoulderY - 0.5, 0.6, shoulderY + 0.6);
        ctx.strokeStyle = rgba(accent, 0.6); ctx.lineWidth = 0.5; ctx.stroke();
      }
      return;
    }
    if (type === "katana") {
      // катана у пояса: ножны назад, рукоять вперёд
      const ex = -10 * wide + fl * 0.6;
      ctx.beginPath(); ctx.moveTo(5.2, hipY - 3.4); ctx.lineTo(ex, hipY + 3.4);
      ctx.strokeStyle = "#17171d"; ctx.lineWidth = 1.7; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex + 0.9, hipY + 3.1); ctx.lineTo(ex - 0.4, hipY + 3.5);
      ctx.strokeStyle = rgba(accent, 0.9); ctx.lineWidth = 0.9; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(5.2, hipY - 3.4); ctx.lineTo(7.8, hipY - 4.2);
      ctx.strokeStyle = "#0a0a0d"; ctx.lineWidth = 2.1; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(3.6, hipY - 2.4); ctx.lineTo(3.9, hipY - 4.7);               // цуба
      ctx.strokeStyle = rgba(accent, 0.9); ctx.lineWidth = 0.6; ctx.stroke();
      ctx.fillStyle = rgba(accent, 0.8); ctx.fillRect(6, hipY - 4.2, 0.6, 0.6); ctx.fillRect(7.1, hipY - 4.5, 0.6, 0.6);
    } else if (type === "obi") {
      // бант оби: две петли и хвосты
      const bx = -4.6 * wide, by = hipY - 2.6;
      ctx.fillStyle = rgba(accent, 0.92);
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx - 3 + fl * 0.3, by - 7.4, bx - 6.4 + fl * 0.4, by - 3.8); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx - 5 + fl * 0.4, by - 0.2, bx - 7.6 + fl * 0.5, by + 3.4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(accent, 0.8); ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx - 3 + fl * 0.5, by + 3.4, bx - 3.4 + fl * 0.8, by + 6.6); ctx.stroke();
      ctx.fillStyle = "#ffe6f0"; ctx.beginPath(); ctx.arc(bx, by, 1, 0, TAU); ctx.fill();
    }
  },

  /** Знаки на одежде: у врагов — отличительные, у скинов игрока — по skin.mark. */
  _marks(ctx, kind, accent, wide, shoulderY, hipY, hemY, skin) {
    ctx.lineCap = "round";
    const A = a => rgba(accent, a);
    if (kind === "player") {
      ctx.strokeStyle = A(0.8); ctx.fillStyle = A(0.75); ctx.lineWidth = 0.7;
      switch (skin.mark) {
        case "rune":     // ромб-руна
          ctx.beginPath(); ctx.moveTo(0.4, shoulderY + 2.6); ctx.lineTo(2, shoulderY + 4.6); ctx.lineTo(0.4, shoulderY + 6.6); ctx.lineTo(-1.2, shoulderY + 4.6); ctx.closePath(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0.4, shoulderY + 6.6); ctx.lineTo(0.4, hipY - 4); ctx.stroke();
          break;
        case "sash":     // перевязь через грудь
          ctx.lineWidth = 1.2; ctx.strokeStyle = A(0.7);
          ctx.beginPath(); ctx.moveTo(-3 * wide, shoulderY + 0.8); ctx.lineTo(3.2 * wide, hipY - 2.8); ctx.stroke();
          break;
        case "moon":     // полумесяц
          ctx.beginPath(); ctx.arc(0.8, shoulderY + 5.4, 2, 0.7, TAU - 0.7); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0.8, hipY - 5); ctx.lineTo(0.8, hipY - 2.8); ctx.stroke();
          break;
        case "bolt":     // молния
          ctx.lineWidth = 0.9; ctx.lineJoin = "miter";
          ctx.beginPath(); ctx.moveTo(1.8, shoulderY + 2); ctx.lineTo(-0.5, shoulderY + 5.3); ctx.lineTo(1.1, shoulderY + 5.3); ctx.lineTo(-1, shoulderY + 8.8); ctx.stroke();
          ctx.lineJoin = "round";
          break;
        case "petals":   // лепестки на плаще
          for (const q of [[-1.6, hipY - 6.4, 0.5], [1.8, hipY - 3.6, -0.4], [-0.4, shoulderY + 3.8, 0.9]]) {
            ctx.beginPath(); ctx.ellipse(q[0], q[1], 1.3, 0.8, q[2], 0, TAU); ctx.fill();
          }
          break;
        case "eyes":     // глазки на крыльях-плаще
          ctx.lineWidth = 0.6; ctx.strokeStyle = A(0.65);
          ctx.beginPath(); ctx.arc(-0.2, hipY - 7, 1.4, 0, TAU); ctx.stroke();
          ctx.beginPath(); ctx.arc(2.2, hipY - 4, 0.8, 0, TAU); ctx.stroke();
          break;
        default: {
          const f = MARK_PARTS[skin.mark];
          if (f) {
            const G = SKIN_G;
            G.accent = accent; G.wide = wide; G.shoulderY = shoulderY; G.hipY = hipY; G.hemY = hemY; G.now = performance.now();
            f(ctx, G);
          }
        }
      }
      return;
    }
    ctx.strokeStyle = A(0.7); ctx.fillStyle = A(0.7); ctx.lineWidth = 0.7;
    if (kind === "blade") {
      // перевязь и царапины-засечки
      ctx.beginPath(); ctx.moveTo(-3 * wide, shoulderY + 0.8); ctx.lineTo(3.2 * wide, hipY - 3); ctx.strokeStyle = "#1b141a"; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.strokeStyle = A(0.7); ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(-1, shoulderY + 3); ctx.lineTo(2, shoulderY + 6); ctx.moveTo(-1.5, shoulderY + 5.5); ctx.lineTo(1.5, shoulderY + 8.5); ctx.stroke();
    } else if (kind === "gunner") {
      // патронташ через грудь, подсумки на поясе, высокий воротник
      ctx.beginPath(); ctx.moveTo(-3.2, shoulderY + 1); ctx.lineTo(3.4, hipY - 3.4); ctx.strokeStyle = "#1d1912"; ctx.lineWidth = 1.7; ctx.stroke();
      ctx.fillStyle = A(0.85);
      for (let i = 0; i < 3; i++) { const t = 0.22 + i * 0.28; ctx.fillRect(lerp(-3.2, 3.4, t) - 0.5, lerp(shoulderY + 1, hipY - 3.4, t) - 0.7, 1, 1.4); }
      ctx.fillStyle = "#13120d"; ctx.fillRect(2.6, hipY - 4.8, 2.4, 2.2);
      ctx.strokeStyle = A(0.6); ctx.lineWidth = 0.5; ctx.strokeRect(2.6, hipY - 4.8, 2.4, 2.2);
      ctx.fillStyle = "#0a0a0e"; ctx.beginPath(); ctx.moveTo(-3.4, shoulderY + 0.5); ctx.lineTo(-2.2, shoulderY - 4); ctx.lineTo(3.2, shoulderY + 0.2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = A(0.5); ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(-2.2, shoulderY - 4); ctx.lineTo(3.2, shoulderY + 0.2); ctx.stroke();
    } else if (kind === "swift") {
      ctx.beginPath();
      for (const o of [2, 5]) { ctx.moveTo(-2, shoulderY + o); ctx.lineTo(0.5, shoulderY + o + 1.5); ctx.lineTo(3, shoulderY + o); }
      ctx.stroke();
      // лёгкая обмотка на поясе
      ctx.beginPath(); ctx.moveTo(-3.6, hipY - 4.4); ctx.lineTo(4, hipY - 5.4); ctx.strokeStyle = A(0.4); ctx.stroke();
    } else if (kind === "brute") {
      // нагрудник
      ctx.fillStyle = "#12111a"; ctx.beginPath(); ctx.moveTo(-3.2 * wide, shoulderY + 1); ctx.lineTo(4.2 * wide, shoulderY + 1); ctx.lineTo(4.6 * wide, hipY - 5); ctx.lineTo(-2.6 * wide, hipY - 5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = A(0.4); ctx.lineWidth = 0.6; ctx.stroke();
      // пряжка ремня и швы пластин подола
      ctx.strokeStyle = A(0.8); ctx.beginPath(); ctx.arc(0.8, hipY - 2.4, 1.7, 0, TAU); ctx.stroke();
      ctx.strokeStyle = A(0.3); ctx.beginPath();
      for (const x of [-2.4, 3.4]) { ctx.moveTo(x * wide, hipY - 0.6); ctx.lineTo((x - 0.3) * wide, hemY); }
      ctx.stroke();
      // дальний наплечник (меньше и темнее) и ближний с шипами
      ctx.fillStyle = "#100f16"; ctx.beginPath(); ctx.ellipse(-2.4, shoulderY + 1, 4.2, 2.6, -0.1, Math.PI, TAU); ctx.fill();
      ctx.fillStyle = "#17161f"; ctx.beginPath(); ctx.ellipse(1.7, shoulderY + 0.6, 5.8, 3.4, -0.2, Math.PI, TAU); ctx.fill();
      ctx.strokeStyle = A(0.85); ctx.lineWidth = 0.7; ctx.stroke();
      ctx.fillStyle = "#1d1c27";
      for (const x of [-1.6, 2, 5.2]) { ctx.beginPath(); ctx.moveTo(x - 1, shoulderY - 1.6); ctx.lineTo(x, shoulderY - 4.3); ctx.lineTo(x + 1, shoulderY - 1.8); ctx.closePath(); ctx.fill(); }
    }
  },

  _head(ctx, ch, skin, look, maskC, accent, tint, hq) {
    const kind = ch.kind;
    const headType = skin ? skin.head : look.heads[ch.variant % look.heads.length];
    const big = kind === "player" ? 1 : kind === "brute" ? 0.85 : 0.9;
    const boost = ch.eyeBoost || 0;
    const A = a => rgba(accent, a);
    const now = performance.now();
    ctx.scale(big, big);
    // украшения позади маски
    const decor = kind === "player" || tint ? maskC : "#2a2a35";
    ctx.fillStyle = decor; ctx.strokeStyle = decor;
    switch (headType) {
      case "horns": {
        // два загнутых наружу рога: дальний темнее, на кончиках неоновый блик
        for (const hn of [0, 1]) {
          ctx.fillStyle = hn || tint ? decor : mixc(decor, "#000000", 0.28);
          ctx.beginPath();
          if (hn) { ctx.moveTo(1.2, -6.8); ctx.quadraticCurveTo(2.6, -11.6, 8, -14.6); ctx.quadraticCurveTo(7.2, -9.2, 4.8, -5.2); }
          else    { ctx.moveTo(-5, -4.8); ctx.quadraticCurveTo(-5.2, -10.6, -8.8, -14.2); ctx.quadraticCurveTo(-2, -11.4, -1.8, -6.8); }
          ctx.closePath(); ctx.fill();
          if (!tint) {
            ctx.strokeStyle = A(0.85); ctx.lineWidth = 0.6;
            ctx.beginPath();
            if (hn) { ctx.moveTo(6.4, -12.8); ctx.lineTo(8, -14.6); } else { ctx.moveTo(-7.4, -12.2); ctx.lineTo(-8.8, -14.2); }
            ctx.stroke();
          }
        }
        ctx.fillStyle = decor;
        break;
      }
      case "antlers": {
        // перистые усики мотылька
        ctx.lineWidth = 0.9;
        for (const a of [{ x0: -1.8, cx: -4.6, x1: -8, y1: -13.6, k: 0.8 }, { x0: 2.6, cx: 3.4, x1: 7.2, y1: -14.4, k: 1 }]) {
          ctx.beginPath(); ctx.moveTo(a.x0, -6.6); ctx.quadraticCurveTo(a.cx, -11.2, a.x1, a.y1); ctx.stroke();
          ctx.lineWidth = 0.55;
          for (const t of [0.35, 0.55, 0.75, 0.92]) {
            const u = 1 - t;
            const px = u * u * a.x0 + 2 * u * t * a.cx + t * t * a.x1, py = u * u * -6.6 + 2 * u * t * -11.2 + t * t * a.y1;
            let dx = 2 * u * (a.cx - a.x0) + 2 * t * (a.x1 - a.cx), dy = 2 * u * (-11.2 + 6.6) + 2 * t * (a.y1 + 11.2);
            const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
            const L = 2.7 * a.k * (1 - t * 0.5);
            ctx.beginPath();
            ctx.moveTo(px, py); ctx.lineTo(px + dx * L * 0.5 - dy * L, py + dy * L * 0.5 + dx * L);
            ctx.moveTo(px, py); ctx.lineTo(px + dx * L * 0.5 + dy * L, py + dy * L * 0.5 - dx * L);
            ctx.stroke();
          }
          ctx.lineWidth = 0.9;
        }
        break;
      }
      case "antenna": {
        // зубчатая антенна с лампой и боковые плавники
        ctx.lineWidth = 0.9; ctx.lineJoin = "miter"; ctx.strokeStyle = tint || mixc(maskC, accent, 0.7);
        ctx.beginPath(); ctx.moveTo(0.6, -6.4); ctx.lineTo(2.4, -9.4); ctx.lineTo(0.2, -10.8); ctx.lineTo(2.4, -14); ctx.stroke();
        ctx.lineJoin = "round";
        const lamp = tint || accent;
        if (hq) { ctx.globalAlpha *= 0.35; ctx.fillStyle = lamp; ctx.beginPath(); ctx.arc(2.4, -14.6, 3.4, 0, TAU); ctx.fill(); ctx.globalAlpha /= 0.35; }
        ctx.fillStyle = lamp; ctx.beginPath(); ctx.arc(2.4, -14.6, 1.5, 0, TAU); ctx.fill();
        ctx.fillStyle = tint || "#1b1c25";
        ctx.beginPath(); ctx.moveTo(-5.2, -1.2); ctx.lineTo(-8.6, -3.6); ctx.lineTo(-7.2, 0.4); ctx.lineTo(-8.2, 3.6); ctx.lineTo(-5, 3); ctx.closePath(); ctx.fill();
        if (!tint) { ctx.strokeStyle = A(0.8); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-8.6, -3.6); ctx.lineTo(-7.2, 0.4); ctx.lineTo(-8.2, 3.6); ctx.stroke(); }
        break;
      }
      case "bow": {
        // ленточный бант: две петли, узел и хвосты
        ctx.fillStyle = tint || accent;
        ctx.beginPath(); ctx.moveTo(-3.4, -6.2); ctx.quadraticCurveTo(-6, -11.4, -9, -8.2); ctx.quadraticCurveTo(-7.4, -5.2, -3.4, -6.2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-3.4, -6.2); ctx.quadraticCurveTo(-8.4, -4.2, -9, -0.6); ctx.quadraticCurveTo(-4.6, -2, -3.4, -6.2); ctx.fill();
        if (!tint) {
          ctx.strokeStyle = rgba("#ffffff", 0.35); ctx.lineWidth = 0.4;
          ctx.beginPath(); ctx.moveTo(-5, -8.4); ctx.quadraticCurveTo(-6.6, -9, -7.8, -8.2); ctx.stroke();
          ctx.fillStyle = mixc(accent, "#ffffff", 0.45); ctx.beginPath(); ctx.arc(-3.4, -6.2, 1.2, 0, TAU); ctx.fill();
        } else { ctx.beginPath(); ctx.arc(-3.4, -6.2, 1.2, 0, TAU); ctx.fill(); }
        ctx.fillStyle = decor;
        break;
      }
      case "spike": {
        // гребень из трёх шипов
        ctx.beginPath();
        ctx.moveTo(-4.8, -4.6); ctx.lineTo(-7.2, -11); ctx.lineTo(-2.8, -6.4);
        ctx.lineTo(-3.6, -13.6); ctx.lineTo(0.6, -7.2);
        ctx.lineTo(1.8, -12); ctx.lineTo(3.8, -6); ctx.closePath(); ctx.fill();
        if (!tint) { ctx.strokeStyle = A(0.65); ctx.lineWidth = 0.55; ctx.beginPath(); ctx.moveTo(-7.2, -11); ctx.lineTo(-2.8, -6.4); ctx.moveTo(-3.6, -13.6); ctx.lineTo(0.6, -7.2); ctx.moveTo(1.8, -12); ctx.lineTo(3.8, -6); ctx.stroke(); }
        break;
      }
    }
    // детали новых скинов: позади маски
    const hp = HEAD_PARTS[headType], C = SKIN_C;
    if (hp) {
      C.tint = tint; C.accent = accent; C.mc = maskC; C.hq = hq; C.now = now; C.boost = boost;
      if (hp.back) { hp.back(ctx, C); ctx.lineWidth = 1; ctx.lineJoin = "round"; ctx.lineCap = "round"; }
    }
    // маска
    const mc = kind === "player" ? maskC : (tint || "#16161c");
    const maskPath = () => {
      ctx.beginPath();
      ctx.moveTo(0, -7.5);
      ctx.bezierCurveTo(5.5, -7.5, 6.8, -2, 5.2, 3.2);
      ctx.quadraticCurveTo(3, 7, 0, 7.2);
      ctx.quadraticCurveTo(-4.5, 6.5, -5.6, 2);
      ctx.bezierCurveTo(-6.5, -3, -5, -7.5, 0, -7.5);
    };
    ctx.fillStyle = mc;
    maskPath(); ctx.fill();
    if (!tint) {
      ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.lineWidth = 0.5; ctx.stroke();
      // тень снизу и блик сверху — маска выглядит объёмной
      ctx.save(); ctx.clip();
      ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(1, 6.5, 7, 3.2, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.22)"; ctx.beginPath(); ctx.ellipse(-1.8, -4.6, 3.2, 1.4, -0.4, 0, TAU); ctx.fill();
      ctx.restore();
      // контровой свет по затылку: тёмная голова читается на тёмном фоне
      if (kind !== "player" || skin.rim) {
        ctx.beginPath(); ctx.moveTo(-5.2, 3.6); ctx.bezierCurveTo(-6.8, -3, -5.2, -7.6, 0, -7.6);
        ctx.strokeStyle = A(0.55 + 0.35 * boost); ctx.lineWidth = 0.8; ctx.stroke();
      }
      // знаки на лице игрока
      if (kind === "player") {
        if (skin.mark === "rune") { ctx.strokeStyle = A(0.9); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(1.6, -6.2); ctx.lineTo(2.6, -4.6); ctx.lineTo(1.6, -3); ctx.lineTo(0.6, -4.6); ctx.closePath(); ctx.stroke(); }
        else if (skin.mark === "petals") { ctx.fillStyle = A(0.32); ctx.beginPath(); ctx.ellipse(-0.8, 3.6, 1.7, 1, 0, 0, TAU); ctx.ellipse(4.2, 3.4, 1.5, 0.9, 0, 0, TAU); ctx.fill(); }
        else if (skin.mark === "eyes") { ctx.fillStyle = A(0.8); ctx.beginPath(); ctx.arc(2, -5.4, 0.7, 0, TAU); ctx.fill(); }
        else if (skin.mark === "bolt") { ctx.strokeStyle = A(0.7); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-1, 4.4); ctx.lineTo(5, 4.2); ctx.stroke(); }
      }
    }
    // головные уборы поверх маски
    if (headType === "hat") {
      // соломенная кобунтика: конус с рёбрами, ободок и завязки под подбородком
      ctx.fillStyle = tint || "#0d0d10";
      ctx.beginPath(); ctx.moveTo(-11.5, -2.4); ctx.lineTo(0.5, -11); ctx.lineTo(11.5, -2.4); ctx.quadraticCurveTo(0, -4.4, -11.5, -2.4); ctx.fill();
      if (!tint) {
        ctx.strokeStyle = rgba("#ffffff", 0.08); ctx.lineWidth = 0.4;
        ctx.beginPath(); ctx.moveTo(0.5, -10.6); ctx.lineTo(-6, -3.4); ctx.moveTo(0.5, -10.6); ctx.lineTo(7, -3.4); ctx.moveTo(0.5, -10.6); ctx.lineTo(0.6, -3.9); ctx.stroke();
        ctx.strokeStyle = A(0.85); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-11.5, -2.4); ctx.quadraticCurveTo(0, -4.4, 11.5, -2.4); ctx.stroke();
        ctx.strokeStyle = A(0.45); ctx.lineWidth = 0.4;
        ctx.beginPath(); ctx.moveTo(-5.4, -3.6); ctx.quadraticCurveTo(-5.4, 4, -1.6, 7); ctx.moveTo(5.8, -3.6); ctx.quadraticCurveTo(6.2, 4, 2.6, 7.2); ctx.stroke();
      }
    } else if (headType === "hood") {
      const hoodC = tint || (kind === "player" ? "#0c0a14" : ink2(look, ch));
      ctx.fillStyle = hoodC;
      if (kind === "player" && !tint) {
        // длинный хвост капюшона колышется
        const w = Math.sin(now / 240) * 1.2;
        ctx.beginPath(); ctx.moveTo(-6.4, 1); ctx.quadraticCurveTo(-10.4 + w, 4, -9.4 + w * 1.4, 11); ctx.quadraticCurveTo(-6.4 + w * 0.5, 8, -4.2, 5.5); ctx.closePath(); ctx.fill();
      }
      ctx.beginPath(); ctx.moveTo(-7, 5); ctx.quadraticCurveTo(-8.5, -8, 1, -11.5); ctx.quadraticCurveTo(8, -7, 7, -1);
      ctx.quadraticCurveTo(2.5, -6.5, -3, -3.5); ctx.quadraticCurveTo(-5, 0, -4.2, 5.5); ctx.closePath(); ctx.fill();
      if (!tint) {
        // тёмная глубина под капюшоном и контровой свет по краю
        ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.moveTo(-4.2, 5.5); ctx.quadraticCurveTo(-5, 0, -3, -3.5); ctx.quadraticCurveTo(2.5, -6.5, 7, -1); ctx.lineTo(5.6, -2.6); ctx.quadraticCurveTo(1.6, -5.2, -2.2, -2.6); ctx.quadraticCurveTo(-3.6, 0, -3, 5); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-7, 5); ctx.quadraticCurveTo(-8.5, -8, 1, -11.5); ctx.quadraticCurveTo(6, -9.4, 7, -3);
        ctx.strokeStyle = A(0.5); ctx.lineWidth = 0.7; ctx.stroke();
      }
    } else if (headType === "helmet") {
      ctx.fillStyle = tint || "#1c1d24";
      ctx.beginPath(); ctx.moveTo(-6.6, 0.4); ctx.quadraticCurveTo(-6.8, -8.8, 0, -8.8); ctx.quadraticCurveTo(7, -8.8, 6.6, -0.5); ctx.closePath(); ctx.fill();
      if (!tint) {
        // козырёк, блик, гребень
        ctx.strokeStyle = "#2a2b34"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-6.6, -1.1); ctx.lineTo(7.8, -1.5); ctx.stroke();
        ctx.strokeStyle = rgba("#ffffff", 0.14); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-4.4, -6.2); ctx.quadraticCurveTo(-1.6, -8.2, 2.4, -7.6); ctx.stroke();
        ctx.strokeStyle = A(0.7); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-6.6, 0.4); ctx.quadraticCurveTo(-6.8, -8.8, 0, -8.8); ctx.stroke();
        if (kind === "gunner") {
          // дальномер-линза на шлеме
          ctx.strokeStyle = A(0.9); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(5.8, -3.8, 1.5, 0, TAU); ctx.stroke();
          ctx.fillStyle = A(0.8); ctx.beginPath(); ctx.arc(5.8, -3.8, 0.55, 0, TAU); ctx.fill();
        } else {
          // щёчные пластины и гребень у брута
          ctx.fillStyle = "#1c1d24"; ctx.beginPath(); ctx.moveTo(-6.2, 0.4); ctx.lineTo(-6.4, 5.4); ctx.lineTo(-3, 4.2); ctx.lineTo(-3.4, 0.4); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = A(0.6); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-5.4, -7.4); ctx.quadraticCurveTo(0, -10.2, 5.4, -6.8); ctx.stroke();
        }
      }
    } else if (headType === "band") {
      // повязка с узлом и двумя хвостами
      const wob = Math.sin(now / 120) * 1.5;
      ctx.strokeStyle = tint || accent; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(-5.8, -3); ctx.quadraticCurveTo(0, -4.4, 6, -3.4); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-5.8, -3); ctx.quadraticCurveTo(-9, -2.6, -11.4, 1 + wob); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-5.8, -3); ctx.quadraticCurveTo(-8.6, -4.6, -10.6, -2.4 - wob * 0.7); ctx.stroke();
      ctx.fillStyle = tint || accent; ctx.beginPath(); ctx.arc(-5.8, -3, 1.1, 0, TAU); ctx.fill();
    } else if (headType === "mask") {
      // клыкастая маска на нижней половине лица
      ctx.fillStyle = tint || "#1f1f27";
      ctx.beginPath(); ctx.moveTo(-5.6, 1); ctx.lineTo(6.4, 0.3); ctx.quadraticCurveTo(6.4, 4.2, 4.6, 5.4);
      ctx.quadraticCurveTo(3, 7, 0, 7.2); ctx.quadraticCurveTo(-4.5, 6.5, -5.6, 2.4); ctx.closePath(); ctx.fill();
      if (!tint) {
        ctx.strokeStyle = A(0.7); ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(-5.6, 1); ctx.lineTo(6.4, 0.3); ctx.stroke();
        ctx.fillStyle = rgba("#e8e2d6", 0.85);
        for (const x of [-1.2, 1.8, 4.6]) { ctx.beginPath(); ctx.moveTo(x - 0.9, 0.7); ctx.lineTo(x, 3.2); ctx.lineTo(x + 0.9, 0.5); ctx.closePath(); ctx.fill(); }
      }
    }
    if (hp && hp.front) { hp.front(ctx, C); ctx.lineWidth = 1; ctx.lineJoin = "round"; ctx.lineCap = "round"; }
    if (tint) return;
    if (kind === "player" && skin.noEyes) return;   // голова — свет, без глаз (скин «Светоч»)
    // глаза: форма не меняется; при усилении (замах) — ярче, чуть крупнее, белое ядро и мягкий ореол (ореол только в high)
    const b = clamp(boost, 0, 1), qb = Math.round(b * 8) / 8;
    const eye = (x, y, rx, ry, rot, col, k) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, rx * k, ry * k, rot, 0, TAU); ctx.fill(); };
    if (kind === "player") {
      const k = 1 + 0.22 * b;
      const two = !skin.mono;   // скины с повязкой/линзой/дырой в мешке — один глаз
      if (hq && (b > 0.05 || skin.rim)) {
        const ha = (skin.rim ? 0.1 : 0) + 0.2 * b;
        eye(0.4, -0.2, 1.5, 2.6, 0.08, rgba(accent, ha * 0.6), k * 2.1); if (two) eye(4.0, -0.2, 1.3, 2.4, 0.08, rgba(accent, ha * 0.6), k * 2.1);
        eye(0.4, -0.2, 1.5, 2.6, 0.08, rgba(accent, ha), k * 1.5); if (two) eye(4.0, -0.2, 1.3, 2.4, 0.08, rgba(accent, ha), k * 1.5);
      }
      const ec = b > 0.05 ? mixc(skin.eye, accent, qb * 0.9) : skin.eye;
      eye(0.4, -0.2, 1.5, 2.6, 0.08, ec, k); if (two) eye(4.0, -0.2, 1.3, 2.4, 0.08, ec, k);
      if (b > 0.05) { eye(0.4, -0.3, 1.5, 2.6, 0.08, rgba("#ffffff", 0.9 * b), k * 0.5); if (two) eye(4.0, -0.3, 1.3, 2.4, 0.08, rgba("#ffffff", 0.9 * b), k * 0.5); }
      ctx.fillStyle = "rgba(255,255,255,.8)";
      ctx.beginPath(); ctx.arc(0.0, -1.3, 0.45, 0, TAU); if (two) ctx.arc(3.6, -1.3, 0.4, 0, TAU); ctx.fill();
    } else {
      // злые скошенные глаза-щели
      const k = 1 + 0.3 * b, r = 1.05;
      const ec = b > 0.05 ? mixc(accent, "#ffffff", qb * 0.5) : accent;
      if (hq && b > 0.05) {
        for (const [m, a] of [[2.5, 0.12], [1.7, 0.22]]) {
          eye(1.3, -0.6, r * 1.45, r * 0.8, 0.38, rgba(accent, a * b), k * m); eye(4.3, -0.7, r * 1.25, r * 0.7, -0.38, rgba(accent, a * b), k * m);
        }
      }
      eye(1.3, -0.6, r * 1.45, r * 0.8, 0.38, ec, k); eye(4.3, -0.7, r * 1.25, r * 0.7, -0.38, ec, k);
      if (b > 0.05) { eye(1.3, -0.6, r * 1.45, r * 0.8, 0.38, rgba("#ffffff", b), k * 0.55); eye(4.3, -0.7, r * 1.25, r * 0.7, -0.38, rgba("#ffffff", b), k * 0.55); }
    }
  },

  _weapon(ctx, ch, p, J, accent, hq) {
    const w = ch.weapon || "none";
    if (w === "none") return;
    const h = J.hand, e = J.elbow;
    // направление клинка: вдоль предплечья либо заданный угол
    let dx = h.x - e.x, dy = h.y - e.y;
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    if (p.wBlend > 0) {
      const ax = Math.cos(p.wAngle), ay = Math.sin(p.wAngle);
      dx = lerp(dx, ax, p.wBlend); dy = lerp(dy, ay, p.wBlend);
      const l2 = Math.hypot(dx, dy) || 1; dx /= l2; dy /= l2;
    }
    // рука в ротированной системе: переводим обратно из rigJoints (там уже учтён наклон),
    // а здесь мы внутри ctx.rotate(lean) — поэтому берём локальные координаты руки без наклона
    const sh = { x: 1, y: J.hipY - 9 };
    const hx = sh.x + Math.sin(p.armF) * 6 + Math.sin(p.armF + p.elbowF) * 6;
    const hy = sh.y + Math.cos(p.armF) * 6 + Math.cos(p.armF + p.elbowF) * 6;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(Math.atan2(dy, dx));
    const glow = (wd, col, a) => { if (!hq) return; ctx.globalAlpha *= a; ctx.lineWidth = wd; ctx.strokeStyle = col; ctx.stroke(); ctx.globalAlpha /= a; };
    if (w === "dagger") {
      // обмотка рукояти, гарда, клинок с долом и светящейся кромкой
      ctx.fillStyle = "#0b0c10";
      ctx.fillRect(-2.4, -0.9, 2.8, 1.8);
      ctx.fillStyle = rgba(accent, 0.6); ctx.fillRect(-1.8, -0.9, 0.4, 1.8); ctx.fillRect(-0.7, -0.9, 0.4, 1.8);
      ctx.fillStyle = "#1b1c23"; ctx.fillRect(0.3, -2, 0.9, 4);
      ctx.beginPath(); ctx.moveTo(1.2, -1.1); ctx.lineTo(8.6, -0.9); ctx.lineTo(10, 0.2); ctx.lineTo(1.2, 1.1); ctx.closePath();
      ctx.fillStyle = "#171820"; ctx.fill();
      ctx.beginPath(); ctx.moveTo(1.4, 0); ctx.lineTo(7.6, 0); ctx.strokeStyle = rgba("#ffffff", 0.14); ctx.lineWidth = 0.35; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1.2, -1.1); ctx.lineTo(8.6, -0.9); ctx.lineTo(10, 0.2);
      glow(3, accent, 0.35);
      ctx.strokeStyle = accent; ctx.lineWidth = 0.7; ctx.stroke();
    } else if (w === "pistol") {
      ctx.fillStyle = "#101117";
      ctx.fillRect(-1, -1.6, 7.5, 2.8);
      ctx.fillRect(-0.5, 0.6, 2, 3.2);
      ctx.fillStyle = "#181920"; ctx.fillRect(2.2, -2.1, 4.2, 0.6);       // ствол над затвором
      ctx.fillStyle = accent; ctx.fillRect(1.5, -0.7, 3.8, 0.9);
      ctx.fillRect(6.6, -1.2, 0.8, 1);                                      // огонёк у дула
    } else if (w === "knives") {
      // два изогнутых ножа с кольцом на рукояти
      for (const off of [0, -2.2]) {
        ctx.beginPath(); ctx.moveTo(-0.6, off - 0.8); ctx.lineTo(5.6, off - 0.8); ctx.quadraticCurveTo(7.6, off - 0.6, 8, off + 0.7); ctx.quadraticCurveTo(4, off + 0.1, -0.6, off + 0.8); ctx.closePath();
        ctx.fillStyle = "#171820"; ctx.fill(); ctx.strokeStyle = accent; ctx.lineWidth = 0.6; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(-1.4, -1.1, 1.1, 0, TAU); ctx.strokeStyle = rgba(accent, 0.8); ctx.lineWidth = 0.5; ctx.stroke();
    } else if (w === "rifle") {
      // приклад, ствольная коробка, магазин, оптика и дульный тормоз
      ctx.fillStyle = "#121318";
      ctx.fillRect(-4.6, -1.3, 2.4, 2.4);
      ctx.fillRect(-2.4, -1.5, 11, 2.6);
      ctx.fillRect(8.6, -0.9, 5.6, 1.2);
      ctx.fillRect(13.4, -1.4, 1.2, 2.2);
      ctx.fillRect(1.6, 1, 2, 3.4);
      ctx.fillStyle = "#1a1b22"; ctx.fillRect(0.4, -2.9, 5, 1.3);
      ctx.fillStyle = accent; ctx.fillRect(5, -2.7, 0.8, 0.9);
      ctx.fillRect(4, -0.9, 5, 0.6);
    } else if (w === "claw") {
      // когти на обмотке костяшек
      ctx.fillStyle = "#101710"; ctx.fillRect(-1.6, -2, 2, 4);
      ctx.strokeStyle = accent; ctx.lineWidth = 0.9;
      ctx.beginPath(); for (const o of [-1.5, 0, 1.5]) { ctx.moveTo(0.2, o); ctx.quadraticCurveTo(3.4, o - 0.8, 6.4, o + 1.2); } ctx.stroke();
      ctx.fillStyle = rgba(accent, 0.4);
      ctx.beginPath(); ctx.moveTo(0.2, -1.5); ctx.quadraticCurveTo(3.4, -2.3, 6.4, -0.3); ctx.lineTo(6.4, 0.2); ctx.quadraticCurveTo(3.4, -1.3, 0.2, 0); ctx.fill();
    } else if (w === "hammer") {
      // древко с обмоткой, шипастый боёк и светящаяся грань
      ctx.strokeStyle = "#17181f"; ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(11.4, 0); ctx.stroke();
      ctx.strokeStyle = rgba(accent, 0.5); ctx.lineWidth = 0.5;
      ctx.beginPath(); for (const x of [-1.6, 0.4, 2.4]) { ctx.moveTo(x, -1); ctx.lineTo(x + 0.7, 1); } ctx.stroke();
      ctx.fillStyle = "#1a1b22"; ctx.fillRect(10, -4.5, 5.4, 9);
      ctx.beginPath(); ctx.moveTo(10, -4.5); ctx.lineTo(12.2, -7); ctx.lineTo(14.2, -4.5); ctx.moveTo(10, 4.5); ctx.lineTo(12.2, 7); ctx.lineTo(14.2, 4.5);
      ctx.fill();
      ctx.strokeStyle = accent; ctx.lineWidth = 0.7; ctx.strokeRect(10, -4.5, 5.4, 9);
      ctx.fillStyle = rgba(accent, 0.55); ctx.fillRect(14.2, -3.4, 1.2, 6.8);
    }
    ctx.restore();
  },

  /** Мировые координаты кисти/дула для эффектов и снарядов. */
  handWorld(ch, extra = 0) {
    const look = ch.kind === "player" ? null : ENEMY_LOOKS[ch.kind];
    const J = rigJoints(ch.anim.pose, look ? look.legLen : 8, look ? look.hunch : 0);
    const p = ch.anim.pose;
    let dx = Math.sin(p.armF + p.elbowF), dy = Math.cos(p.armF + p.elbowF);
    if (p.wBlend > 0) { dx = lerp(dx, Math.cos(p.wAngle), p.wBlend); dy = lerp(dy, Math.sin(p.wAngle), p.wBlend); }
    const s = ch.scale;
    return { x: ch.x + (J.hand.x + dx * extra) * s * ch.facing, y: ch.y + (J.hand.y + dy * extra) * s };
  },
};

function ink2(look, ch) { return mixc(look.cloth[ch.variant % look.cloth.length], "#000000", 0.2); }
