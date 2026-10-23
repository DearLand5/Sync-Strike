/* =====================================================================
   Мир, физика тел и Player.
   Координаты мира: y вниз, пол y = 0, арена 0..WORLD.w.
   ===================================================================== */
const WORLD = {
  w: 1400,
  wall: 18,
  platforms: [
    { x: 250, y: -105, w: 170 },
    { x: 980, y: -105, w: 170 },
    { x: 600, y: -190, w: 200 },
  ],
};

const PL = {
  w: 12, h: 30,
  run: 178, walk: 82,
  accG: 1600, accA: 1000, decG: 2000, decA: 450,
  grav: 1650, fallMax: 640, jumpV: 505, airJumpV: 440,
  coyote: 0.08, jbuf: 0.11,
  dodgeV: 440, dodgeT: 0.22, dodgeIF: 0.2, dodgeCD: 0.42,
  hurtT: 0.32, hurtIF: 0.75, maxHp: 100,
};

/** Общая физика тела с полом, стенами и односторонними платформами. */
function moveBody(b, dt, opts = {}) {
  const prevY = b.y;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.onGround = false;
  const half = b.w / 2;
  b.x = clamp(b.x, WORLD.wall + half, WORLD.w - WORLD.wall - half);
  if (b.y >= 0) { b.y = 0; if (b.vy > 0) b.vy = 0; b.onGround = true; b.platform = null; return; }
  if (b.vy >= 0 && !(b.dropT > 0) && !opts.noPlatforms) {
    for (const p of WORLD.platforms) {
      if (b.x + half * 0.5 > p.x && b.x - half * 0.5 < p.x + p.w && prevY <= p.y + 0.5 && b.y >= p.y) {
        b.y = p.y; b.vy = 0; b.onGround = true; b.platform = p; return;
      }
    }
  }
  b.platform = null;
}
/** Ближайшая опора под точкой (пол или платформа) — для тени и камеры. */
function groundBelow(x, y) {
  let g = 0;
  for (const p of WORLD.platforms) if (x > p.x && x < p.x + p.w && p.y >= y - 0.5 && p.y < g) g = p.y;
  return g;
}

class Player {
  constructor(skinId) {
    this.kind = "player";
    this.setSkin(skinId);
    this.anim = new AnimState();
    this.reset(WORLD.w / 2);
  }
  setSkin(id) {
    this.skinId = SKINS[id] ? id : "shade";
    this.skin = SKINS[this.skinId];
    this.scarfColor = this.skin.scarf;
    if (this.anim) this.anim.scarf = null;
  }
  reset(x) {
    this.x = x; this.y = 0; this.vx = 0; this.vy = 0;
    this.w = PL.w; this.h = PL.h; this.scale = 1;
    this.facing = 1; this.onGround = true; this.platform = null; this.dropT = 0;
    this.hp = PL.maxHp; this.maxHp = PL.maxHp;
    this.state = "idle"; this.stateT = 0;
    this.iframes = 0; this.coyoteT = 0; this.jumpBufT = 0; this.airJumps = 1;
    this.dodgeCD = 0; this.dodgeDir = 1;
    this.action = null;
    this.weapon = "dagger"; this.pistolT = 0;
    this.flash = 0; this.eyeBoost = 0; this.alpha = 1;
    this.runPhase = 0;
    this.groundY = 0;
    this.moveDist = 0; this.didDoubleJump = false;
    this.counterT = 0;          // окно контратаки после идеального уклона
    this.anim = new AnimState();
  }

  get alive() { return this.state !== "dead"; }
  get canAct() { return !["dead", "victory", "hurt", "dodge"].includes(this.state); }
  get invulnerable() { return this.iframes > 0 || (this.action && this.action.iframes); }
  get centerY() { return this.y - this.h * 0.55; }

  setState(s) { if (this.state !== s) { this.state = s; this.stateT = 0; } }

  /** Обработка нажатия прыжка (буфер). */
  pressJump() { this.jumpBufT = PL.jbuf; }

  tryDodge(game) {
    if (!this.alive || this.state === "victory" || this.dodgeCD > 0 || this.state === "hurt") return false;
    // уклонение прерывает атаку только после фазы подготовки
    if (this.action && this.action.t < this.action.startup) return false;
    const mx = game.input.moveX;
    this.dodgeDir = Math.abs(mx) > 0.2 ? sign(mx) : this.facing;
    this.facing = this.dodgeDir;
    this.action = null;
    this.dodgeCount = (this.dodgeCount || 0) + 1;
    this.setState("dodge");
    this.iframes = PL.dodgeIF;
    this.dodgeCD = PL.dodgeCD;
    this.vx = this.dodgeDir * PL.dodgeV;
    if (!this.onGround) this.vy = Math.min(this.vy, -60);
    game.sfx("dodge");
    game.fx.dust(this.x, this.y, 5);
    return true;
  }

  hurt(dmg, fromX, game) {
    if (!this.alive || this.invulnerable || this.state === "victory") return false;
    this.hp = Math.max(game.mode === "practice" ? 1 : 0, this.hp - dmg);
    this.action = null;
    this.iframes = PL.hurtIF;
    const dir = sign(this.x - fromX);
    this.vx = dir * 230; this.vy = -220;
    this.flash = 1;
    this.anim.squashT = 1;
    if (this.hp <= 0) { this.setState("dead"); game.onPlayerDead(); }
    else this.setState("hurt");
    return true;
  }

  update(dt, game) {
    const inp = game.input;
    this.stateT += dt;
    this.iframes = Math.max(0, this.iframes - dt);
    this.dodgeCD = Math.max(0, this.dodgeCD - dt);
    this.jumpBufT = Math.max(0, this.jumpBufT - dt);
    this.dropT = Math.max(0, this.dropT - dt);
    this.flash = Math.max(0, this.flash - dt * 5);
    this.pistolT = Math.max(0, this.pistolT - dt);
    this.counterT = Math.max(0, this.counterT - dt);
    this.eyeBoost = Math.max(0, this.eyeBoost - dt * 2.5);
    const wasGround = this.onGround;
    const st = this.state;

    if (st === "dead" || st === "victory") {
      this.vx = damp(this.vx, 0, 6, dt);
      this.vy = Math.min(this.vy + PL.grav * dt, PL.fallMax);
      moveBody(this, dt);
      this._pose(dt, game);
      return;
    }

    // ---- горизонтальное управление ----
    const act = this.action;
    let control = 1;
    if (st === "hurt") control = 0;
    else if (st === "dodge") control = 0;
    else if (act) control = act.def.moveControl == null ? 0.15 : act.def.moveControl;
    const target = inp.moveX * (inp.walk ? PL.walk : PL.run);
    if (control > 0) {
      const acc = this.onGround ? (Math.abs(target) > Math.abs(this.vx) || sign(target) !== sign(this.vx) ? PL.accG : PL.decG) : (target !== 0 ? PL.accA : PL.decA);
      const want = target * control + this.vx * (1 - control);
      if (this.vx < want) this.vx = Math.min(want, this.vx + acc * dt);
      else if (this.vx > want) this.vx = Math.max(want, this.vx - acc * dt);
      if (Math.abs(inp.moveX) > 0.2 && !act) this.facing = sign(inp.moveX);
    }

    // ---- прыжок, спрыгивание, двойной прыжок ----
    this.coyoteT = this.onGround ? PL.coyote : Math.max(0, this.coyoteT - dt);
    if (this.jumpBufT > 0 && st !== "hurt" && st !== "dodge" && (!act || act.t > act.startup + act.active)) {
      if (this.onGround && this.platform && inp.moveY > 0.6) {
        this.dropT = 0.25; this.y += 2; this.onGround = false; this.jumpBufT = 0;
      } else if (this.onGround || this.coyoteT > 0) {
        this.vy = -PL.jumpV; this.onGround = false; this.coyoteT = 0; this.jumpBufT = 0;
        this.action = null; this.setState("jump");
        this.anim.squashT = 0.6;
        game.sfx("jump"); game.fx.dust(this.x, this.y, 4);
      } else if (this.airJumps > 0) {
        this.airJumps--; this.vy = -PL.airJumpV; this.jumpBufT = 0;
        this.action = null; this.setState("jump");
        this.didDoubleJump = true;
        game.sfx("jump", true);
        game.fx.ring(this.x, this.y - 4, 3, 22, this.skin.accent, 0.3, 2);
      }
    }

    // ---- гравитация ----
    const noGrav = st === "dodge" || (act && act.noGravity);
    if (!noGrav) {
      let g = PL.grav;
      if (this.vy < 0 && !inp.jumpHeldAll && st === "jump") g *= 2.3;     // переменная высота прыжка
      this.vy = Math.min(this.vy + g * dt, PL.fallMax);
    } else if (st === "dodge") this.vy = damp(this.vy, 0, 10, dt);

    // ---- действие (атака) ----
    if (act) game.combat.updateAction(this, act, dt);

    // ---- уклонение ----
    if (this.state === "dodge") {
      this.vx = this.dodgeDir * PL.dodgeV * (1 - easeIn(this.stateT / PL.dodgeT) * 0.6);
      if (this.stateT >= PL.dodgeT) { this.setState(this.onGround ? "idle" : "fall"); this.vx *= 0.5; }
    }
    if (this.state === "hurt" && this.stateT >= PL.hurtT) this.setState(this.onGround ? "idle" : "fall");

    const px = this.x, vyBefore = this.vy;
    moveBody(this, dt);
    this.moveDist += Math.abs(this.x - px);
    if (this.onGround) { this.airJumps = 1; }

    // ---- приземление ----
    if (!wasGround && this.onGround) {
      const h = clamp(vyBefore / 600, 0.3, 1);
      this.anim.squashT = h;
      game.sfx("land", h);
      game.fx.dust(this.x, this.y, Math.round(3 + h * 4));
      if (!this.action && this.state !== "dodge" && this.state !== "hurt") this.setState("land");
    }

    // ---- автоматические состояния движения ----
    if (!this.action && ["idle", "walk", "run", "jump", "fall", "land"].includes(this.state)) {
      if (this.state === "land" && this.stateT < 0.09) { /* держим позу приземления */ }
      else if (this.onGround) {
        const sp = Math.abs(this.vx);
        this.setState(sp > 110 ? "run" : sp > 12 ? "walk" : "idle");
      } else this.setState(this.vy < 0 ? "jump" : "fall");
    }
    if ((this.state === "run" || this.state === "walk") && this.onGround) {
      const prevPh = this.runPhase;
      this.runPhase += Math.abs(this.vx) * dt * 0.075;
      if (Math.floor(prevPh / Math.PI) !== Math.floor(this.runPhase / Math.PI)) game.sfx("step");
    }
    this.groundY = this.onGround ? this.y : groundBelow(this.x, this.y);
    this.weapon = this.pistolT > 0 ? "pistol" : "dagger";
    this._pose(dt, game);
  }

  /** Целевая поза по состоянию + музыкальные акценты, затем смешивание. */
  _pose(dt, game) {
    const c = game.clock, st = this.state, t = this.stateT;
    const P = {};
    const pulse = c.pulse, strong = c.strongPulse;
    let rate = 16;
    switch (st) {
      case "idle":
        Object.assign(P, { bodyY: 0.5 * Math.sin(performance.now() / 420) + pulse * 1.0, sx: 1 + pulse * 0.03, sy: 1 - pulse * 0.04, lean: 0.03 - strong * 0.05, legAmp: 0, legSpread: 1, tuck: 0, armF: 0.25 + pulse * 0.1, elbowF: 0.55, armB: -0.25, wBlend: 0, headTilt: -strong * 0.08, cloak: 0 });
        break;
      case "walk":
        Object.assign(P, { legPhase: this.runPhase, legAmp: 0.55, lean: 0.08, bodyY: Math.abs(Math.sin(this.runPhase)) * -0.6 + pulse * 0.5, armF: 0.1 + Math.sin(this.runPhase) * 0.3, elbowF: 0.5, armB: -0.1 - Math.sin(this.runPhase) * 0.3, tuck: 0, sx: 1, sy: 1, wBlend: 0, headTilt: 0 });
        break;
      case "run":
        Object.assign(P, { legPhase: this.runPhase, legAmp: 1.0, lean: 0.24, bodyY: Math.abs(Math.sin(this.runPhase)) * -1.2 + pulse * 0.6, armF: -0.6, elbowF: 0.9, armB: 0.5, tuck: 0, sx: 1, sy: 1, cloak: 0.3, wBlend: 0, headTilt: 0.05 });
        break;
      case "jump":
        Object.assign(P, { tuck: 0.35, legAmp: 0.25, legPhase: 1.2, lean: 0.1, armF: -0.5, elbowF: 0.6, armB: -0.9, sx: 0.94, sy: 1.08, bodyY: 0, wBlend: 0, headTilt: -0.1 });
        break;
      case "fall":
        Object.assign(P, { tuck: 0.1, legAmp: 0.15, legPhase: 2, legSpread: 1.3, lean: 0.05, armF: 1.4, elbowF: -0.4, armB: -1.6, sx: 1, sy: 1.04, bodyY: 0, wBlend: 0, headTilt: 0.05 });
        break;
      case "land":
        Object.assign(P, { bodyY: 2.5, sx: 1.1, sy: 0.9, tuck: 0, legAmp: 0, legSpread: 1.4, lean: 0.12, armF: 0.6, armB: -0.6 });
        rate = 30;
        break;
      case "dodge": {
        const k = t / PL.dodgeT;
        Object.assign(P, { lean: 0.5, bodyY: 3, tuck: 0.6, legAmp: 0, armF: -1.3, elbowF: 0.4, armB: -1.5, sx: 1.12, sy: 0.86, cloak: -0.6, headTilt: 0.2 * (1 - k) });
        rate = 30;
        break;
      }
      case "hurt":
        Object.assign(P, { lean: -0.38, armF: -0.7, elbowF: 0.3, armB: -1.1, headTilt: -0.35, bodyY: 1, tuck: 0.2, sx: 1, sy: 1 });
        rate = 28;
        break;
      case "victory":
        Object.assign(P, { armF: 3.0 - pulse * 0.2, elbowF: 0.1, armB: -0.5, lean: -0.06 - strong * 0.05, headTilt: -0.18, bodyY: pulse * 1.2, legSpread: 1.3, legAmp: 0, tuck: 0, sx: 1, sy: 1, wBlend: 0 });
        break;
      case "dead":
        Object.assign(P, { lean: clamp(t * 4, 0, 1.35), bodyY: clamp(t * 30, 0, 7), sy: 0.85, armF: 1.2, armB: 1.0, legSpread: 1.6, headTilt: 0.5, tuck: 0 });
        rate = 10;
        break;
      case "attack":
        if (this.action) { Object.assign(P, game.combat.actionPose(this, this.action)); rate = 40; }
        break;
    }
    AnimationSystem.blend(this.anim, P, rate, dt);
    if (P.legPhase != null) this.anim.pose.legPhase = P.legPhase;
    AnimationSystem.secondary(this.anim, this, dt);
  }
}
