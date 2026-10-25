/* =====================================================================
   Пафосные анимации (экспериментально): позы героя с акцентом ровно на доле.
   Авто — за ~1 с до дропа/кульминации (акцент совпадает со входом в часть) и после зачистки волны;
   колесо — игрок сам выбирает позу (сенсорная кнопка ★ или клавиша Q), акцент — на ближайшей доле.
   Настройка poseMode: both | auto | wheel | off. Любое действие (атака, уклон, прыжок, движение) прерывает позу.
   Поза: pose(k, r, p, game) → параметры позы; k — ход до акцента 0..1, r — после акцента 0..1.
   ===================================================================== */
const POSE_RELEASE = 0.45;          // сколько держится поза после акцента, с
const POSE_IDS = ["sky", "cape", "kneel", "gun"];
const POSES = {
  // клинок к небу: присед с клинком у земли → рывок вверх, клинок над головой
  sky: {
    name: "Клинок к небу", short: "НЕБО",
    pose(k, r) {
      if (k < 0.45) {
        const a = easeInOut(k / 0.45);
        return { bodyY: 2.6 * a, lean: 0.28 * a, armF: lerp(0.3, -0.5, a), elbowF: 0.6, armB: lerp(-0.3, -0.6, a), wBlend: a, wAngle: 0.9 * a, headTilt: 0.32 * a, legSpread: 1 + 0.6 * a, sx: 1 + 0.04 * a, sy: 1 - 0.06 * a, cloak: 0.3 * a, legAmp: 0, tuck: 0 };
      }
      const b = easeOut((k - 0.45) / 0.55), h = r > 0 ? 1 - 0.15 * Math.sin(Math.PI * r) : 1;
      return { bodyY: lerp(2.6, -0.9, b) * h, lean: lerp(0.28, -0.12, b), armF: lerp(-0.5, 3.05, b), elbowF: lerp(0.6, 0.05, b), armB: lerp(-0.6, -1.0, b), wBlend: 1, wAngle: lerp(0.9, -1.45, b), headTilt: lerp(0.32, -0.38, b), legSpread: 1.6, sx: 1, sy: lerp(0.94, 1.05, b), cloak: -0.7 * b, eye: b, legAmp: 0, tuck: 0 };
    },
    accent(g, p) {
      const hd = CharacterRenderer.handWorld(p, 14), col = p.skin.accent;
      g.fx.line(hd.x, hd.y, hd.x, hd.y - 260, "#ffffff", 3, 0.35);
      g.fx.line(hd.x, hd.y, hd.x, hd.y - 200, col, 7, 0.45);
      g.fx.glow(hd.x, hd.y, 6, 46, "#ffffff", 0.3, 0.6);
      g.fx.sparks(hd.x, hd.y, 14, col, 300, -Math.PI / 2, 1.2, 0.5);
      g.sfx("slash", 1.5);
    },
  },
  // вихрь плаща: разворот на месте (два оборота), плащ раскрыт, затем широкая стойка с клинком в сторону врага
  cape: {
    name: "Вихрь плаща", short: "ВИХРЬ",
    pose(k, r, p) {
      if (k < 0.2) {
        const a = easeOut(k / 0.2);
        return { lean: 0.2 * a, armF: lerp(0.3, 1.0, a), elbowF: 1.1, armB: lerp(-0.3, 0.8, a), bodyY: 1.6 * a, cloak: 0.5 * a, headTilt: 0.25 * a, legSpread: 1, wBlend: 0, sx: 1, sy: 1, legAmp: 0, tuck: 0 };
      }
      if (k < 0.82) {
        const s = (k - 0.2) / 0.62, th = TAU * 2 * easeInOut(s);
        p.facing = Math.cos(th) >= 0 ? p.poseAct.face : -p.poseAct.face;
        return { lean: 0.05, armF: 1.6, elbowF: 0.1, armB: -1.6, bodyY: 0.6 - Math.sin(Math.PI * s) * 1.4, cloak: 1.3, headTilt: -0.1, legSpread: 1.25, wBlend: 1, wAngle: 0.2, sx: Math.max(0.18, Math.abs(Math.cos(th))), sy: 1.03, legAmp: 0, tuck: 0.15 * Math.sin(Math.PI * s) };
      }
      p.facing = p.poseAct.face;
      const b = easeOut((k - 0.82) / 0.18);
      return { lean: lerp(0.05, 0.14, b), armF: 1.55, elbowF: 0.05, armB: lerp(-1.6, -1.2, b), bodyY: lerp(0.6, 2.4, b), cloak: lerp(1.3, -0.4, b), headTilt: 0.12, legSpread: lerp(1.25, 2.1, b), wBlend: 1, wAngle: lerp(0.2, 0, b), sx: 1, sy: 1 - 0.04 * b, eye: b, legAmp: 0, tuck: 0 };
    },
    accent(g, p) {
      const col = p.skin.accent;
      g.fx.ring(p.x, p.y - 16, 8, 70, col, 0.45, 3);
      g.fx.ring(p.x, p.y - 16, 4, 44, "#ffffff", 0.3, 2);
      g.fx.slashArc(p.x, p.y - 18, 34, -Math.PI * 0.9, Math.PI * 0.9, col, 5, 0.3);
      g.fx.dust(p.x, p.y, 10);
      g.sfx("dash");
    },
  },
  // перед бурей: на одно колено, клинок упёрт в землю, голова опущена → на акценте взгляд вверх, глаза вспыхивают
  kneel: {
    name: "Перед бурей", short: "КОЛЕНО",
    pose(k, r) {
      const a = easeOut(clamp(k / 0.3, 0, 1)), up = k > 0.88 ? easeOut((k - 0.88) / 0.12) : 0;
      const rise = r > 0.4 ? easeInOut((r - 0.4) / 0.6) : 0;
      const breathe = k > 0.3 && k < 0.88 ? Math.sin((k - 0.3) * 18) * 0.25 : 0;
      return { bodyY: (5.6 * a + breathe) * (1 - rise), legSpread: 1 + 1.1 * a * (1 - rise), lean: (0.42 * a - 0.2 * up) * (1 - rise), headTilt: lerp(0.55 * a, -0.2, up), armF: lerp(0.3, 0.75, a), elbowF: 0.9, wBlend: a, wAngle: 1.45 * a, armB: lerp(-0.3, 0.55, a), cloak: 0.45 * a - 0.5 * up, sx: 1, sy: 1 - 0.05 * a, eye: up, legAmp: 0, tuck: 0 };
    },
    accent(g, p) {
      const col = p.skin.accent;
      g.fx.glow(p.x + p.facing * 2, p.y - 26, 4, 30, col, 0.35, 0.7);
      g.fx.shockwave(p.x, p.groundY, col, 180);
      g.fx.dust(p.x, p.y, 12);
      g.fx.sparks(p.x + p.facing * 9, p.y, 10, col, 240, -Math.PI / 2, 2.4, 0.4);
      g.camera.shake(0.18);
      g.sfx("land", 1);
    },
  },
  // выстрел в небо: пистолет крутится в руке → ствол вверх, выстрел на акценте
  gun: {
    name: "Выстрел в небо", short: "ВЫСТРЕЛ",
    pose(k, r, p) {
      p.pistolT = Math.max(p.pistolT, 0.2);
      if (k < 0.6) {
        const s = k / 0.6;
        return { armF: 1.3, elbowF: 0.5, wBlend: 1, wAngle: TAU * 3 * easeOut(s), lean: -0.04, headTilt: 0.12 * Math.sin(Math.PI * s), legSpread: 1.3, armB: -0.4, bodyY: 0.4, sx: 1, sy: 1, cloak: 0, legAmp: 0, tuck: 0 };
      }
      const a = easeInOut((k - 0.6) / 0.4), kick = r > 0 ? Math.exp(-r * 8) : 0;
      return { armF: lerp(1.3, 2.75, a) + 0.25 * kick, elbowF: lerp(0.5, 0.08, a), wBlend: 1, wAngle: lerp(0, -0.35, a), lean: lerp(-0.04, -0.14, a), headTilt: lerp(0, -0.32, a), legSpread: 1.4, armB: lerp(-0.4, -0.7, a), bodyY: 0.4 + kick, sx: 1, sy: 1.02, cloak: -0.2 * a, eye: a, legAmp: 0, tuck: 0 };
    },
    accent(g, p) {
      const hd = CharacterRenderer.handWorld(p, 10), col = p.skin.accent;
      g.fx.glow(hd.x, hd.y - 4, 4, 30, "#ffffff", 0.18, 0.6);
      g.fx.ring(hd.x, hd.y - 4, 2, 20, "#ffffff", 0.18, 2);
      g.fx.line(hd.x, hd.y - 6, hd.x + p.facing * 30, hd.y - 300, col, 3, 0.3);
      g.fx.sparks(hd.x, hd.y - 6, 10, col, 320, -Math.PI / 2, 0.8, 0.4);
      g.sfx("shot", true);
    },
  },
};

/** Управление позами: автозапуск, колесо, акцент. Один на игру (Game.poses). */
class PoseSystem {
  constructor(game) { this.game = game; this.reset(); }
  reset() {
    this.lastAutoAt = -1;       // время дропа, под который уже была поза
    this.waveDone = 0;          // номер волны, после которой уже была поза
    this.bonusT = -9;           // время последнего бонуса за позу (без фарма очков)
    this.lastId = null;
    this.focus = false;
  }
  get mode() { return this.game.settings.v.poseMode || "both"; }
  get autoOn() { return this.mode === "both" || this.mode === "auto"; }
  get wheelOn() { return this.mode === "both" || this.mode === "wheel"; }

  /** Можно ли сейчас встать в позу: на земле, без действия, не в добивании. */
  canPose() {
    const g = this.game, p = g.player;
    return g.state === "battle" && p.alive && p.onGround && !p.action && !p.scripted && !g.combat.td &&
      ["idle", "walk", "run", "land", "pose"].includes(p.state);
  }
  /** Безопасно ли для автопозы: рядом никто не замахивается и не стоит вплотную. */
  _safe() {
    const g = this.game, p = g.player;
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const d = Math.abs(e.x - p.x);
      if ((e.state === "windup" || e.state === "attack") && d < 320) return false;
      if (d < 60) return false;
    }
    return !g.combat.projectiles.some(b => b.owner !== "player" && Math.abs(b.x - p.x) < 260);
  }
  _pick() {
    let id;
    do id = pick(POSE_IDS); while (id === this.lastId);
    return id;
  }

  /** Ручной выбор с колеса: акцент — на ближайшей доле не раньше чем через 0.7 с. */
  request(id) {
    const g = this.game;
    if (!this.wheelOn || !POSES[id]) return false;
    if (!this.canPose()) { g.fx.text(g.player.x, g.player.y - 50, "НЕ СЕЙЧАС", "#9a9cab", 11, 0.6); return false; }
    const now = g.songNow, at = g.clock.map ? g.clock.nextBeatAfter(now, 0.7) : now + 1;
    this.start(id, clamp(at - now, 0.6, 1.5), false);
    return true;
  }

  start(id, dur, auto) {
    const g = this.game, p = g.player;
    // лицом к ближайшему врагу, иначе к центру арены
    let face = p.facing, bd = 1e9;
    for (const e of g.enemies) if (e.alive && Math.abs(e.x - p.x) < bd) { bd = Math.abs(e.x - p.x); face = sign(e.x - p.x) || face; }
    if (bd > 1e8) face = sign(WORLD.w / 2 - p.x) || face;
    p.facing = face;
    p.poseAct = { id, t: 0, dur, rel: POSE_RELEASE, auto, face, accented: false, sounded: false, at: g.songNow + dur };
    p.vx *= 0.3;
    p.setState("pose");
    this.lastId = id;
    // лёгкий наезд камеры — один акцент на кадр
    g.camera.focus(p.x, p.y - 26, auto ? 1.14 : 1.1, 0.001);
    this.focus = true;
    if (auto) g.letterboxTarget = 0.55;
  }

  /** Каждый кадр боя: автозапуск и сброс наезда камеры, если позу прервали. */
  update() {
    const g = this.game, p = g.player, c = g.clock;
    if (this.focus && p.state !== "pose") this._unfocus();
    if (!this.autoOn || g.state !== "battle" || p.state === "pose") return;
    // за ~1 с до дропа/кульминации: акцент позы — точно на входе в часть
    const peak = c.nextKind === "drop" || c.nextKind === "climax";
    if (peak && c.dropIn > 0.55 && c.dropIn <= 1.05) {
      const at = Math.round((g.songNow + c.dropIn) * 10);
      if (at !== this.lastAutoAt && this.canPose() && this._safe()) { this.lastAutoAt = at; this.start(this._pick(), c.dropIn, true); }
      return;
    }
    // после зачистки волны — на доле (сильная может не успеть до начала следующей волны)
    const W = g.waves;
    if (W.mode === "waves" && W.between > 0.8 && W.between < 2.2 && W.wave > this.waveDone && !g.enemies.some(e => e.alive) && c.events.some(e => e.type === "beat") && this.canPose()) {
      this.waveDone = W.wave;
      const at = c.map ? c.nextBeatAfter(g.songNow, 0.7) : g.songNow + 1;
      this.start(this._pick(), clamp(at - g.songNow, 0.6, 1.4), true);
    }
  }

  /** Ход позы (из Player.update): звук заранее на долю, акцент, конец. Возвращает false, когда поза закончилась. */
  tick(p, dt) {
    const g = this.game, a = p.poseAct;
    a.t += dt;
    if (!a.sounded && a.t >= a.dur - 0.25) { a.sounded = true; g.sfxAt(a.at, "beatHit", 1.3); }
    if (!a.accented && a.t >= a.dur) { a.accented = true; this._accent(p, a); }
    return a.t < a.dur + a.rel;
  }

  _accent(p, a) {
    const g = this.game, col = p.skin.accent;
    POSES[a.id].accent(g, p);
    g.fx.glow(p.x, p.y - 20, 10, 80, col, 0.4, 0.45);
    if (!a.auto || g.clock.kind !== "drop") g.fx.shockwave(p.x, p.groundY, col, 120);   // вход в дроп даёт свою волну
    g.camera.kick(0.022);
    p.eyeBoost = 1;
    this._unfocus();
    // бонус: очки и шаг грува — не чаще раза в 4 с
    if (g.combat.time - this.bonusT > 4) {
      this.bonusT = g.combat.time;
      g.combat.score += 150;
      g.combat.rhythm(1);
      g.fx.text(p.x, p.y - 56, "СТИЛЬ +150", col, 14, 0.9);
    }
  }
  _unfocus() {
    const g = this.game;
    this.focus = false;
    if (!g.combat.td) { g.camera.release(); g.letterboxTarget = 0; }
  }
}
