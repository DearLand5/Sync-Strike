/* =====================================================================
   AnimationSystem + CharacterRenderer + скины.
   Персонажи процедурные: поза — набор параметров, которые плавно
   смешиваются; плащ и шарф — пружины с инерцией. Локальные координаты:
   ноги в (0,0), взгляд вправо, y вниз, рост ≈ 40 единиц.
   ===================================================================== */
const SKINS = {
  shade:   { name: "Тень",    mask: "#e8e2d6", eye: "#06070a", accent: "#3ef0ff", cloak: "#07080c", head: "horns",   scarf: "#3ef0ff" },
  ronin:   { name: "Ронин",   mask: "#1b1c22", eye: "#ff2d4a", accent: "#ff2d4a", cloak: "#0b0708", head: "hat",     scarf: "#ff2d4a" },
  specter: { name: "Призрак", mask: "#f3f0ff", eye: "#2b1a66", accent: "#b18cff", cloak: "#0a0812", head: "hood",    scarf: null },
  volt:    { name: "Вольт",   mask: "#101116", eye: "#ffe34a", accent: "#ffe34a", cloak: "#0b0a06", head: "antenna", scarf: "#ffe34a" },
  sakura:  { name: "Сакура",  mask: "#ffe6f0", eye: "#1a0a12", accent: "#ff5fb0", cloak: "#0d070a", head: "bow",     scarf: "#ff5fb0" },
  moth:    { name: "Мотылёк", mask: "#d7f7e8", eye: "#08140f", accent: "#3dffa8", cloak: "#060b09", head: "antlers", scarf: null },
};

/** Облик врагов: телосложение и варианты снаряжения. */
const ENEMY_LOOKS = {
  blade:  { accent: "#ff2e88", scale: 1.0,  legLen: 8,  hunch: 0.28, coat: 1.0, weapon: "knives", heads: ["hood", "band", "mask"], cloth: ["#0a0609", "#0d0709", "#080608"] },
  gunner: { accent: "#ffb13b", scale: 1.08, legLen: 11, hunch: 0.04, coat: 1.35, weapon: "rifle", heads: ["helmet", "hood", "band"], cloth: ["#0a0907", "#0b0a08", "#080807"] },
  swift:  { accent: "#b6ff3b", scale: 0.82, legLen: 8,  hunch: 0.35, coat: 0.7, weapon: "claw",  heads: ["band", "spike", "mask"], cloth: ["#070a06", "#080b07", "#060806"] },
  brute:  { accent: "#9b6bff", scale: 1.55, legLen: 9,  hunch: 0.18, coat: 1.1, weapon: "hammer", heads: ["helmet", "spike", "horns"], cloth: ["#09070d", "#0a080e", "#08070b"] },
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

    ctx.save();
    ctx.translate(ch.x, ch.y);
    ctx.globalAlpha *= ch.alpha == null ? 1 : ch.alpha;
    // тень под ногами
    if (!tint && ch.groundY != null) {
      const h = clamp((ch.groundY - ch.y) / 120, 0, 1);
      ctx.fillStyle = rgba(accent, 0.18 * (1 - h));
      ctx.beginPath(); ctx.ellipse(0, ch.groundY - ch.y, 10 * s * (1 - h * 0.5), 2.2 * s, 0, 0, TAU); ctx.fill();
    }
    // --- шарф (за телом, в мировых координатах) ---
    if (!tint && ch.scarfColor && st.scarf) {
      ctx.save();
      ctx.translate(-ch.x, -ch.y);
      ctx.beginPath();
      st.scarf.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = ch.scarfColor;
      if (hq) { ctx.globalAlpha *= 0.35; ctx.lineWidth = 5 * s; ctx.stroke(); ctx.globalAlpha /= 0.35; }
      ctx.lineWidth = 2.2 * s; ctx.stroke();
      ctx.strokeStyle = rgba("#ffffff", 0.35); ctx.lineWidth = 0.6 * s; ctx.stroke();
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
    const legs = [-1, 1];
    for (const side of legs) {
      const ph = p.legPhase + (side > 0 ? 0 : Math.PI);
      const fx = side * 2.2 * p.legSpread + Math.sin(ph) * p.legAmp * 5;
      const lift = Math.max(0, -Math.cos(ph)) * p.legAmp * 3 + p.tuck * 5;
      const fy = -lift;
      const hx = side * 1.8;
      ctx.beginPath();
      ctx.moveTo(hx, hipY + 1);
      ctx.quadraticCurveTo(hx + (fx - hx) * 0.5 + 1.8, (hipY + fy) * 0.5, fx, fy);
      const legC = side > 0 ? ink : mixHex(ink, "#000000", 0.4);
      ctx.strokeStyle = legC;
      ctx.lineWidth = look && ch.kind === "brute" ? 3.6 : 2.6;
      ctx.stroke();
      // ботинок
      ctx.fillStyle = legC;
      ctx.beginPath(); ctx.ellipse(fx + 0.9, fy - 0.6, ch.kind === "brute" ? 2.6 : 1.9, 1.1, 0, 0, TAU); ctx.fill();
      if (!tint && side > 0) { ctx.fillStyle = rgba(accent, 0.6); ctx.fillRect(fx + 1.2, fy - 0.9, 1.4, 0.5); }
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
    const wide = ch.kind === "brute" ? 1.35 : 1;
    // задняя рука
    this._arm(ctx, p.armB, 0.5, shoulderY, mixHex(ink, "#000000", 0.4), wide);
    // подкладка плаща — второй слой, чуть шире и с оттенком неона
    if (!tint) {
      ctx.beginPath();
      ctx.moveTo(-3.2 * wide, shoulderY + 1);
      ctx.quadraticCurveTo(-7 * wide + fl * 0.6, hipY - 3, -8.6 * wide + fl * 1.15, hemY + 2.2);
      ctx.lineTo(-4 * wide + fl * 0.6, hemY + 1);
      ctx.closePath();
      ctx.fillStyle = mixHex(ink, accent, 0.16); ctx.fill();
    }
    // плащ
    ctx.beginPath();
    ctx.moveTo(-3.6 * wide, shoulderY);
    ctx.lineTo(3.4 * wide, shoulderY);
    ctx.quadraticCurveTo(6.2 * wide, hipY - 3, 6.5 * wide + fl * 0.3, hemY);
    if (ch.kind === "blade" || ch.kind === "swift") {
      // рваный подол
      const steps = 4;
      for (let i = 1; i <= steps; i++) {
        const x = lerp(6.5 * wide + fl * 0.3, -7.5 * wide + fl, i / steps);
        ctx.lineTo(x + 1, hemY + (i % 2 ? 2.5 : 0));
      }
    } else {
      ctx.lineTo(-7.5 * wide + fl, hemY + 1);
    }
    ctx.quadraticCurveTo(-6 * wide + fl * 0.4, hipY - 4, -3.6 * wide, shoulderY);
    ctx.closePath();
    ctx.fillStyle = ink; ctx.fill();
    if (!tint) {
      ctx.strokeStyle = rgba(accent, 0.28); ctx.lineWidth = 0.6; ctx.stroke();
      // складки
      ctx.strokeStyle = mixHex(ink, "#ffffff", 0.07); ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(-1 * wide, shoulderY + 2); ctx.quadraticCurveTo(-2 * wide + fl * 0.3, hipY - 2, -3 * wide + fl * 0.6, hemY);
      ctx.moveTo(2 * wide, shoulderY + 2); ctx.quadraticCurveTo(2.6 * wide, hipY - 2, 3 * wide + fl * 0.2, hemY);
      ctx.stroke();
      // пояс с развевающимся концом
      ctx.strokeStyle = rgba(accent, 0.75); ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(-4.4 * wide, hipY - 2.5); ctx.quadraticCurveTo(0, hipY - 1.6, 4.8 * wide, hipY - 2.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-4.2 * wide, hipY - 2.4); ctx.quadraticCurveTo(-6 * wide + fl * 0.5, hipY, -7 * wide + fl, hipY + 2 + Math.sin(performance.now() / 140 + ch.x) * 0.8); ctx.stroke();
      if (look) this._marks(ctx, ch.kind, accent, wide, shoulderY, hipY, hemY);
    }
    if (!tint) {
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
    this._arm(ctx, p.armF, p.elbowF, shoulderY, ink, wide);
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

  _arm(ctx, a, elbow, shoulderY, color, wide) {
    const sx = 1, sy = shoulderY + 0.5;
    const ex = sx + Math.sin(a) * 6, ey = sy + Math.cos(a) * 6;
    const hx = ex + Math.sin(a + elbow) * 6, hy = ey + Math.cos(a + elbow) * 6;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy);
    ctx.strokeStyle = color; ctx.lineWidth = 2.2 * wide; ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(hx, hy, 1.5 * wide, 0, TAU); ctx.fill();
  },

  /** Отличительные знаки врагов на одежде. */
  _marks(ctx, kind, accent, wide, shoulderY, hipY, hemY) {
    ctx.strokeStyle = rgba(accent, 0.7); ctx.fillStyle = rgba(accent, 0.7); ctx.lineWidth = 0.7;
    ctx.beginPath();
    if (kind === "blade") { ctx.moveTo(-1, shoulderY + 3); ctx.lineTo(2, shoulderY + 6); ctx.moveTo(-1.5, shoulderY + 5.5); ctx.lineTo(1.5, shoulderY + 8.5); }
    else if (kind === "gunner") {
      ctx.moveTo(1.8, shoulderY + 1); ctx.lineTo(1.8, hemY - 1);
      ctx.stroke();
      // высокий воротник
      ctx.fillStyle = "#0a0a0e"; ctx.beginPath(); ctx.moveTo(-3, shoulderY + 0.5); ctx.lineTo(-1.5, shoulderY - 4); ctx.lineTo(3.2, shoulderY + 0.5); ctx.closePath(); ctx.fill();
      ctx.beginPath();
    }
    else if (kind === "swift") { for (const o of [2, 5]) { ctx.moveTo(-2, shoulderY + o); ctx.lineTo(0.5, shoulderY + o + 1.5); ctx.lineTo(3, shoulderY + o); } }
    else if (kind === "brute") {
      ctx.stroke();
      // наплечник
      ctx.fillStyle = "#15141c"; ctx.beginPath(); ctx.ellipse(1.5, shoulderY + 0.5, 5.5, 3.2, -0.2, Math.PI, TAU); ctx.fill();
      ctx.strokeStyle = rgba(accent, 0.8); ctx.beginPath(); ctx.ellipse(1.5, shoulderY + 0.5, 5.5, 3.2, -0.2, Math.PI, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, hipY - 6, 1.6, 0, TAU);
    }
    ctx.stroke();
  },

  _head(ctx, ch, skin, look, maskC, accent, tint, hq) {
    const kind = ch.kind;
    const headType = skin ? skin.head : look.heads[ch.variant % look.heads.length];
    const big = kind === "player" ? 1 : kind === "brute" ? 0.85 : 0.9;
    ctx.scale(big, big);
    // украшения позади маски
    ctx.fillStyle = maskC; ctx.strokeStyle = maskC;
    switch (headType) {
      case "horns":
        for (const hx of [-2.8, 2.6]) {
          ctx.beginPath(); ctx.moveTo(hx - 1.2, -5); ctx.quadraticCurveTo(hx - 1.5, -10, hx + (hx < 0 ? -1.5 : 0.5), -13.5);
          ctx.quadraticCurveTo(hx + 0.6, -10, hx + 1.4, -5.5); ctx.closePath(); ctx.fill();
        }
        break;
      case "antlers":
        ctx.lineWidth = 1.1;
        for (const hx of [-2.5, 2.5]) {
          ctx.beginPath(); ctx.moveTo(hx, -5); ctx.lineTo(hx * 1.3, -12); ctx.moveTo(hx * 1.15, -9); ctx.lineTo(hx * 2, -11); ctx.stroke();
        }
        break;
      case "antenna":
        ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(0.5, -6); ctx.quadraticCurveTo(3, -11, 1.5, -14); ctx.stroke();
        ctx.fillStyle = tint || accent; ctx.beginPath(); ctx.arc(1.5, -14.5, 1.6, 0, TAU); ctx.fill(); ctx.fillStyle = maskC;
        break;
      case "bow":
        ctx.fillStyle = tint || accent;
        ctx.beginPath(); ctx.moveTo(-3, -6); ctx.lineTo(-8, -9); ctx.lineTo(-7.5, -3.5); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-3, -6); ctx.lineTo(-6, -1); ctx.lineTo(-2, -2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = maskC;
        break;
      case "spike":
        ctx.beginPath(); ctx.moveTo(-3, -5); ctx.lineTo(-1, -12); ctx.lineTo(1.5, -5.5); ctx.closePath(); ctx.fill();
        break;
    }
    // маска
    const mc = kind === "player" ? maskC : (tint || "#16161c");
    ctx.fillStyle = mc;
    ctx.beginPath();
    ctx.moveTo(0, -7.5);
    ctx.bezierCurveTo(5.5, -7.5, 6.8, -2, 5.2, 3.2);
    ctx.quadraticCurveTo(3, 7, 0, 7.2);
    ctx.quadraticCurveTo(-4.5, 6.5, -5.6, 2);
    ctx.bezierCurveTo(-6.5, -3, -5, -7.5, 0, -7.5);
    ctx.fill();
    if (!tint) {
      ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.lineWidth = 0.5; ctx.stroke();
      // тень снизу и блик сверху — маска выглядит объёмной
      ctx.save(); ctx.clip();
      ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(1, 6.5, 7, 3.2, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.22)"; ctx.beginPath(); ctx.ellipse(-1.8, -4.6, 3.2, 1.4, -0.4, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // головные уборы поверх маски
    if (headType === "hat") {
      ctx.fillStyle = tint || "#0d0d10";
      ctx.beginPath(); ctx.moveTo(-11, -2.5); ctx.lineTo(0.5, -10.5); ctx.lineTo(11, -2.5); ctx.quadraticCurveTo(0, -4.2, -11, -2.5); ctx.fill();
      if (!tint) { ctx.strokeStyle = rgba(accent, 0.8); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-11, -2.5); ctx.quadraticCurveTo(0, -4.2, 11, -2.5); ctx.stroke(); }
    } else if (headType === "hood") {
      ctx.fillStyle = tint || (kind === "player" ? "#0c0a14" : ink2(look, ch));
      ctx.beginPath(); ctx.moveTo(-7, 5); ctx.quadraticCurveTo(-8.5, -8, 1, -11.5); ctx.quadraticCurveTo(8, -7, 7, -1);
      ctx.quadraticCurveTo(2.5, -6.5, -3, -3.5); ctx.quadraticCurveTo(-5, 0, -4.2, 5.5); ctx.closePath(); ctx.fill();
    } else if (headType === "helmet") {
      ctx.fillStyle = tint || "#1c1d24";
      ctx.beginPath(); ctx.moveTo(-6.4, 0); ctx.quadraticCurveTo(-6.5, -8.6, 0, -8.6); ctx.quadraticCurveTo(6.8, -8.6, 6.4, -0.5); ctx.closePath(); ctx.fill();
    } else if (headType === "band") {
      ctx.strokeStyle = tint || accent; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-5.8, -3); ctx.lineTo(6, -3.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-5.8, -3); ctx.quadraticCurveTo(-9, -2, -11, 1 + Math.sin(performance.now() / 120) * 1.5); ctx.stroke();
    }
    if (tint) return;
    // глаза
    const boost = ch.eyeBoost || 0;
    if (kind === "player") {
      ctx.fillStyle = skin.eye;
      ctx.beginPath(); ctx.ellipse(0.4, -0.2, 1.5, 2.6, 0.08, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(4.0, -0.2, 1.3, 2.4, 0.08, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.8)";
      ctx.beginPath(); ctx.arc(0.0, -1.3, 0.45, 0, TAU); ctx.arc(3.6, -1.3, 0.4, 0, TAU); ctx.fill();
      ctx.fillStyle = skin.eye;
      if (skin.mask !== "#e8e2d6" && skin.mask !== "#f3f0ff" && skin.mask !== "#ffe6f0" && skin.mask !== "#d7f7e8" || boost > 0.3) {
        ctx.fillStyle = rgba(accent, 0.25 + 0.5 * boost);
        ctx.beginPath(); ctx.ellipse(2.2, -0.2, 4.5, 3.2, 0, 0, TAU); ctx.fill();
      }
    } else {
      const r = 1.05 + boost * 0.9;
      ctx.fillStyle = boost > 0.5 ? "#ffffff" : accent;
      if (hq && boost > 0.2) { ctx.globalAlpha *= 0.4; ctx.beginPath(); ctx.arc(2.6, -0.6, r * 3, 0, TAU); ctx.fillStyle = accent; ctx.fill(); ctx.globalAlpha /= 0.4; ctx.fillStyle = "#ffffff"; }
      ctx.beginPath(); ctx.arc(1.2, -0.6, r, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(4.2, -0.6, r * 0.85, 0, TAU); ctx.fill();
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
      ctx.fillStyle = "#0b0c10";
      ctx.fillRect(-2.2, -0.9, 2.6, 1.8);
      ctx.beginPath(); ctx.moveTo(0.5, -1.1); ctx.lineTo(9.5, 0); ctx.lineTo(0.5, 1.1); ctx.closePath();
      ctx.fillStyle = "#15161c"; ctx.fill();
      ctx.beginPath(); ctx.moveTo(0.5, -1.1); ctx.lineTo(9.5, 0);
      glow(3, accent, 0.35);
      ctx.strokeStyle = accent; ctx.lineWidth = 0.7; ctx.stroke();
    } else if (w === "pistol") {
      ctx.fillStyle = "#101117";
      ctx.fillRect(-1, -1.6, 7.5, 2.8);
      ctx.fillRect(-0.5, 0.6, 2, 3.2);
      ctx.fillStyle = accent; ctx.fillRect(1.5, -0.7, 3.8, 0.9);
    } else if (w === "knives") {
      for (const off of [0, -2.2]) {
        ctx.beginPath(); ctx.moveTo(0, off - 0.8); ctx.lineTo(7, off); ctx.lineTo(0, off + 0.8); ctx.closePath();
        ctx.fillStyle = "#15161c"; ctx.fill(); ctx.strokeStyle = accent; ctx.lineWidth = 0.6; ctx.stroke();
      }
    } else if (w === "rifle") {
      ctx.fillStyle = "#121318";
      ctx.fillRect(-4, -1.5, 16, 2.6);
      ctx.fillRect(-4, 0, 3, 3);
      ctx.fillStyle = accent; ctx.fillRect(4, -1, 6, 0.8);
    } else if (w === "claw") {
      ctx.strokeStyle = accent; ctx.lineWidth = 0.8;
      ctx.beginPath(); for (const o of [-1.4, 0, 1.4]) { ctx.moveTo(0, o); ctx.quadraticCurveTo(3, o - 0.5, 5.5, o + 1); } ctx.stroke();
    } else if (w === "hammer") {
      ctx.strokeStyle = "#15161c"; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(12, 0); ctx.stroke();
      ctx.fillStyle = "#1a1b22"; ctx.fillRect(10, -4.5, 5, 9);
      ctx.strokeStyle = accent; ctx.lineWidth = 0.7; ctx.strokeRect(10, -4.5, 5, 9);
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

function ink2(look, ch) { return mixHex(look.cloth[ch.variant % look.cloth.length], "#000000", 0.2); }
