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
  hurtT: 0.32, hurtIF: 1.0, maxHp: 130,
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
  reset(x, hpMult = 1) {
    this.x = x; this.y = 0; this.vx = 0; this.vy = 0;
    this.scripted = false; this.dodgeType = "roll"; this.dodgeSync = false;
    this.w = PL.w; this.h = PL.h; this.scale = 1;
    this.facing = 1; this.onGround = true; this.platform = null; this.dropT = 0;
    this.maxHp = Math.round(PL.maxHp * hpMult); this.hp = this.maxHp;
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
    this.landT = 0; this.landDur = 0.09; this.landK = 0;    // приземление: длительность и сила
    this.skid = 0; this.skidFx = 0;                          // занос при развороте на бегу
    this.accLean = 0; this.prevVx = 0;                       // наклон от ускорения/торможения
    this.idleT = 0; this.idleVar = 0; this.idleVarT = 0; this.idleVarDur = 1;   // idle-вариации
    this.killT = 0; this.killAmt = 1;                        // жест после убийства
    this.turnT = 0; this.prevFacing = 1;                     // разворот на месте
    this.airT = 0;                                           // время в воздухе (высота прыжка)
    this.poseAct = null;                                     // пафосная поза (10b_poses), состояние "pose"
    this.anim = new AnimState();
  }

  get alive() { return this.state !== "dead"; }
  get canAct() { return !["dead", "victory", "hurt", "dodge", "takedown"].includes(this.state) && !this.scripted; }
  get invulnerable() { return this.iframes > 0 || (this.action && this.action.iframes); }
  get centerY() { return this.y - this.h * 0.55; }

  setState(s) { if (this.state !== s) { this.state = s; this.stateT = 0; } }

  /** Обработка нажатия прыжка (буфер). */
  pressJump() { this.jumpBufT = PL.jbuf; }

  tryDodge(game) {
    if (!this.alive || this.state === "victory" || this.dodgeCD > 0 || this.state === "hurt" || this.scripted) return false;
    // уклонение прерывает атаку только после фазы подготовки
    if (this.action && this.action.t < this.action.startup) return false;
    const mx = game.input.moveX;
    // три вида: воздушный рывок, кувырок по направлению, сальто назад без направления
    if (!this.onGround) { this.dodgeType = "air"; this.dodgeDir = Math.abs(mx) > 0.2 ? sign(mx) : this.facing; this.facing = this.dodgeDir; }
    else if (Math.abs(mx) > 0.2) { this.dodgeType = "roll"; this.dodgeDir = sign(mx); this.facing = this.dodgeDir; }
    else { this.dodgeType = "back"; this.dodgeDir = -this.facing; }
    this.action = null;
    this.dodgeCount = (this.dodgeCount || 0) + 1;
    this.setState("dodge");
    // уклон в такт: дольше неуязвимость и неоновый след
    const j = game.clock.judge(game.songNow);
    this.dodgeSync = j.rating === "perfect" || j.rating === "good";
    this.iframes = PL.dodgeIF + (this.dodgeSync ? 0.08 : 0);
    this.dodgeCD = PL.dodgeCD;
    this.vx = this.dodgeDir * PL.dodgeV * (this.dodgeType === "back" ? 0.8 : 1);
    if (this.dodgeType === "back") { this.vy = -250; this.onGround = false; }
    else if (!this.onGround) this.vy = Math.min(this.vy, -60);
    game.sfx("dodge");
    game.fx.dust(this.x, this.y, 5);
    if (this.dodgeSync) {
      game.combat.rhythm(1);
      game.fx.ring(this.x, this.y - 14, 4, 30, this.skin.accent, 0.3, 2);
      game.fx.text(this.x, this.y - 48, "SYNC", this.skin.accent, 12, 0.5);
    }
    return true;
  }

  /** Скорость фазы шага (рад/с; шаг — каждые π). Под музыку шаги встают на доли: целое число шагов на долю
   *  (или шаг на две доли), ближайшее к естественному темпу шага, и подтяжка фазы к доле. */
  _stepRate(game) {
    const rate = Math.abs(this.vx) * 0.075, c = game.clock;
    if (rate < 2 || !c.map || !game.audio.playing) return rate;
    const spb = rate / Math.PI * c.period;                      // шагов на долю при естественном шаге
    const m = spb < 0.7 ? 0.5 : clamp(Math.round(spb), 1, 4);
    let e = (Math.PI * m * (Math.max(0, c.idx) + c.phase) - this.runPhase) % Math.PI;
    if (e < 0) e += Math.PI;
    if (e > Math.PI / 2) e -= Math.PI;                          // ошибка фазы до ближайшего шага, −π/2..π/2
    return Math.max(0, Math.PI * m / c.period + e * 6);
  }

  hurt(dmg, fromX, game) {
    if (!this.alive || this.invulnerable || this.state === "victory") return false;
    this.hp = Math.max(game.mode === "practice" ? 1 : 0, this.hp - dmg);
    this.action = null;
    this.iframes = game.diff.hurtIF || PL.hurtIF;
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

    if (this.scripted) { this.iframes = Math.max(this.iframes, 0.1); this.queuePose(dt, game); return; }
    if (st === "dead" || st === "victory") {
      this.vx = damp(this.vx, 0, 6, dt);
      this.vy = Math.min(this.vy + PL.grav * dt, PL.fallMax);
      moveBody(this, dt);
      this.queuePose(dt, game);
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
    const noGrav = (st === "dodge" && this.dodgeType !== "back") || (act && act.noGravity);
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
    // пафосная поза: прерывается движением, прыжком, атакой, уклоном, уроном
    if (this.state === "pose") {
      if (!this.poseAct || Math.abs(inp.moveX) > 0.35 || !this.onGround || this.action) this.setState("idle");
      else { this.vx = damp(this.vx, 0, 12, dt); if (!game.poses.tick(this, dt)) this.setState("idle"); }
    }
    if (this.state !== "pose") this.poseAct = null;

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
      // сила приземления: после высокого прыжка — глубокая амортизация, рука касается земли
      this.landK = clamp((vyBefore - 250) / 350, 0, 1);
      this.landDur = lerp(0.08, 0.24, this.landK);
      if (this.landK > 0.7) game.fx.ring(this.x, this.y - 1, 3, 26, this.skin.accent, 0.25, 1.5);
      if (!this.action && this.state !== "dodge" && this.state !== "hurt") this.setState("land");
    }
    this.airT = this.onGround ? 0 : this.airT + dt;

    // ---- автоматические состояния движения ----
    if (!this.action && ["idle", "walk", "run", "jump", "fall", "land"].includes(this.state)) {
      if (this.state === "land" && this.stateT < this.landDur) { /* держим позу приземления */ }
      else if (this.onGround) {
        const sp = Math.abs(this.vx);
        this.setState(sp > 110 ? "run" : sp > 12 ? "walk" : "idle");
      } else this.setState(this.vy < 0 ? "jump" : "fall");
    }
    if ((this.state === "run" || this.state === "walk") && this.onGround) {
      const prevPh = this.runPhase;
      this.runPhase += this._stepRate(game) * dt;
      if (Math.floor(prevPh / Math.PI) !== Math.floor(this.runPhase / Math.PI)) game.sfx("step");
    }
    this.groundY = this.onGround ? this.y : groundBelow(this.x, this.y);
    this.weapon = this.pistolT > 0 ? "pistol" : "dagger";
    // ускорение → наклон корпуса: разгон вперёд, торможение назад (плавно, независимо от кадра)
    const ax = (this.vx - this.prevVx) / Math.max(dt, 1e-4) * this.facing; this.prevVx = this.vx;
    this.accLean = damp(this.accLean, clamp(ax / 1600 * 0.1, -0.16, 0.1), 14, dt);
    // разворот на бегу: игрок давит в обратную сторону, а скорость ещё прежняя — занос с пылью
    const want = Math.abs(inp.moveX) > 0.2 ? sign(inp.moveX) : 0;
    if (this.onGround && !this.action && want && Math.abs(this.vx) > 100 && sign(this.vx) !== want && (this.state === "run" || this.state === "walk" || this.state === "idle")) {
      this.skid = 0.16;
      this.skidFx -= dt;
      if (this.skidFx <= 0) { this.skidFx = 0.05; game.fx.dust(this.x - sign(this.vx) * 3, this.y, 1); }
    } else this.skid = Math.max(0, this.skid - dt);
    // поворот на месте: короткое сжатие по ширине, пока силуэт «переворачивается»
    if (this.facing !== this.prevFacing) { this.prevFacing = this.facing; if (!this.action && this.state !== "dodge") { this.turnT = 0.14; this.anim.cloakV -= 4 * this.facing; } }
    this.turnT = Math.max(0, this.turnT - dt);
    this.killT = Math.max(0, this.killT - dt);
    this.queuePose(dt, game);
  }

  /** Целевая поза по состоянию + музыкальные акценты, затем смешивание. */
  /** Поза считается раз в кадр (не на каждом шаге физики): время копится и применяется в flushPose. */
  queuePose(dt, game) { if (game.deferPose) this._poseDt = (this._poseDt || 0) + dt; else this._pose(dt, game); }
  flushPose(game) { if (this._poseDt > 0) { const dt = this._poseDt; this._poseDt = 0; this._pose(dt, game); } }

  /** Idle-вариации: на сильной доле после паузы — переступание, проверка клинка, встряхивание кисти; между волнами — трюк с клинком. */
  _tickIdle(dt, game) {
    const c = game.clock;
    if (this.state !== "idle" || this.action || !this.onGround) { this.idleT = 0; this.idleVar = 0; this.idleVarT = 0; return; }
    this.idleT += dt;
    if (this.idleVarT > 0) { this.idleVarT -= dt; if (this.idleVarT <= 0) this.idleVar = 0; return; }
    if (this.idleT < 2.0 || !c.events.some(e => e.type === "strongBeat")) return;
    const calm = game.battleActive && game.waves && game.waves.mode === "waves" && !game.enemies.some(e => e.alive);
    this.idleVar = calm && Math.random() < 0.7 ? 4 : randi(1, 3);
    this.idleVarDur = [0, 0.9, 1.1, 0.8, 1.0][this.idleVar];
    this.idleVarT = this.idleVarDur;
    this.idleT = 0.6;
  }

  _pose(dt, game) {
    const c = game.clock, st = this.state, t = this.stateT;
    const P = {};
    const pulse = c.pulse, strong = c.strongPulse;
    const acc = this.accLean;
    let rate = 16;
    if (st === "idle") this._tickIdle(dt, game);
    switch (st) {
      case "idle": {
        Object.assign(P, { bodyY: 0.5 * Math.sin(performance.now() / 420) + pulse * 1.0, sx: 1 + pulse * 0.03, sy: 1 - pulse * 0.04, lean: 0.03 - strong * 0.05 + acc, legAmp: 0, legSpread: 1, tuck: 0, armF: 0.25 + pulse * 0.1, elbowF: 0.55, armB: -0.25, wBlend: 0, headTilt: -strong * 0.08, cloak: 0 });
        const iv = this.idleVar;
        if (iv) {
          const ph = clamp(1 - this.idleVarT / this.idleVarDur, 0, 1), k = Math.sin(Math.PI * ph);
          if (iv === 1) Object.assign(P, { legSpread: 1 + 0.55 * k, bodyY: P.bodyY + 0.9 * k, lean: P.lean + 0.05 * k, headTilt: 0.1 * k, sx: P.sx + 0.03 * k, armB: -0.25 + 0.3 * k });   // переступание
          else if (iv === 2) Object.assign(P, { armF: lerp(P.armF, 1.5, k), elbowF: lerp(0.55, 1.2, k), wBlend: k, wAngle: -1.1 * k, headTilt: 0.22 * k, lean: P.lean + 0.06 * k });   // осмотр клинка
          else if (iv === 3) Object.assign(P, { armF: 0.25 + Math.sin(ph * 26) * 0.3 * k, elbowF: 0.55 + 0.4 * k, headTilt: Math.sin(ph * 12) * 0.1 * k, sy: P.sy + 0.02 * k, bodyY: P.bodyY + 0.6 * k });   // встряхнуть кисть
          else if (iv === 4) {     // трюк с клинком между волнами: оборот в руке и кивок
            const sp = easeInOut(clamp(ph * 1.3, 0, 1));
            Object.assign(P, { armF: lerp(0.25, 1.9, k), elbowF: 0.6, wBlend: k > 0.05 ? 1 : 0, wAngle: -0.6 + TAU * 2 * sp, headTilt: -0.12 * k, lean: P.lean - 0.05 * k, bodyY: P.bodyY - 0.6 * k, legSpread: 1 + 0.25 * k });
          }
        }
        break;
      }
      case "walk":
        Object.assign(P, { legPhase: this.runPhase, legAmp: 0.55, lean: 0.08 + acc, bodyY: Math.abs(Math.sin(this.runPhase)) * -0.6 + pulse * 0.5, armF: 0.1 + Math.sin(this.runPhase) * 0.3, elbowF: 0.5, armB: -0.1 - Math.sin(this.runPhase) * 0.3, tuck: 0, sx: 1, sy: 1, wBlend: 0, headTilt: 0 });
        break;
      case "run":
        Object.assign(P, { legPhase: this.runPhase, legAmp: 1.0, lean: 0.24 + acc, bodyY: Math.abs(Math.sin(this.runPhase)) * -1.2 + pulse * 0.6, armF: -0.6, elbowF: 0.9, armB: 0.5, tuck: 0, sx: 1, sy: 1, cloak: 0.3, wBlend: 0, headTilt: 0.05 });
        break;
      case "jump":
        Object.assign(P, { tuck: 0.35, legAmp: 0.25, legPhase: 1.2, lean: 0.1 + acc, armF: -0.5, elbowF: 0.6, armB: -0.9, sx: 0.94, sy: 1.08, bodyY: 0, wBlend: 0, headTilt: -0.1 });
        break;
      case "fall": {
        // чем дольше падение — тем шире раскинуты руки и вытянутее силуэт
        const f = clamp(this.airT / 0.7, 0, 1);
        Object.assign(P, { tuck: 0.1, legAmp: 0.15, legPhase: 2, legSpread: 1.3 + 0.3 * f, lean: 0.05 + acc, armF: 1.4 + 0.5 * f, elbowF: -0.4, armB: -1.6 - 0.3 * f, sx: 1 - 0.03 * f, sy: 1.04 + 0.05 * f, bodyY: 0, wBlend: 0, headTilt: 0.05 });
        break;
      }
      case "land": {
        // амортизация: проседание, затем подъём с лёгким перелётом; жёсткая посадка — рука касается пола
        const h = this.landK, k = clamp(t / this.landDur, 0, 1);
        const sink = k < 0.4 ? easeOut(k / 0.4) : 1 - easeInOut((k - 0.4) / 0.6) * 0.65;
        Object.assign(P, { bodyY: (1.5 + 3.2 * h) * sink, sx: 1 + (0.05 + 0.08 * h) * sink, sy: 1 - (0.05 + 0.1 * h) * sink, tuck: 0, legAmp: 0, legSpread: 1.3 + 0.35 * h, lean: 0.1 + 0.28 * h * sink, armF: 0.6 + 0.6 * h, armB: -0.6 - 0.5 * h, headTilt: 0.1 * h * sink, cloak: 0.5 * sink });
        if (h > 0.7) Object.assign(P, { armF: 0.2, elbowF: 0.1, armB: 0.1 });
        rate = 30;
        break;
      }
      case "dodge": {
        const k = clamp(t / PL.dodgeT, 0, 1);
        if (this.dodgeType === "roll") {
          // кувырок вперёд: группировка и полный оборот
          Object.assign(P, { lean: 0.3, bodyY: 4, tuck: 1, legAmp: 0, armF: 2.2, elbowF: 1.2, armB: 1.6, sx: 0.95, sy: 0.82, cloak: -0.5, headTilt: 0.4, spin: TAU * easeInOut(k) });
        } else if (this.dodgeType === "back") {
          // сальто назад
          Object.assign(P, { lean: -0.2, bodyY: 0, tuck: 0.8 * Math.sin(k * Math.PI), legAmp: 0, armF: 2.8, elbowF: 0.3, armB: 2.6, sx: 1, sy: 1, cloak: 0.4, headTilt: -0.3, spin: -TAU * easeInOut(k) });
        } else {
          // воздушный рывок: вытянутый силуэт
          Object.assign(P, { lean: 0.65, bodyY: 1, tuck: 0.5, legAmp: 0, armF: -1.5, elbowF: 0.2, armB: -1.7, sx: 1.3, sy: 0.8, cloak: -1, headTilt: 0.15 });
        }
        rate = 32;
        break;
      }
      case "takedown": {
        const td = game.combat.td;
        if (td) Object.assign(P, game.combat.tdPose(this, td));
        rate = 42;
        break;
      }
      case "hurt": {
        // удар: резкий отклон назад с перелётом и сжатием, затем плавное выпрямление
        const k = easeOut(clamp(t / 0.07, 0, 1)), r = clamp((t - 0.07) / 0.25, 0, 1);
        Object.assign(P, { lean: lerp(-0.2, -0.5, k) + 0.2 * r, armF: -0.7, elbowF: 0.3, armB: -1.1, headTilt: -0.35 * (1 - r * 0.5), bodyY: 1 + (1 - r), tuck: 0.2, sx: 1 - 0.06 * (1 - r), sy: 1 + 0.05 * (1 - r) });
        rate = 28;
        break;
      }
      case "victory":
        Object.assign(P, { armF: 3.0 - pulse * 0.2, elbowF: 0.1, armB: -0.5, lean: -0.06 - strong * 0.05, headTilt: -0.18, bodyY: pulse * 1.2, legSpread: 1.3, legAmp: 0, tuck: 0, sx: 1, sy: 1, wBlend: 0 });
        break;
      case "dead": {
        // сначала пошатнулся и опустился на колено, затем завалился вперёд
        const k = clamp((t - 0.22) / 0.5, 0, 1);
        Object.assign(P, { lean: t < 0.22 ? -0.3 * easeOut(t / 0.22) : lerp(-0.3, 1.4, easeIn(k)), bodyY: t < 0.22 ? 1 : clamp(1 + (t - 0.22) * 14, 1, 7), sy: 1 - 0.15 * easeOut(k), armF: t < 0.22 ? -0.9 : lerp(-0.9, 1.2, k), armB: t < 0.22 ? -1.3 : lerp(-1.3, 1.0, k), legSpread: 1 + 0.6 * k, headTilt: t < 0.22 ? -0.4 : 0.5 * k, tuck: 0 });
        rate = 14;
        break;
      }
      case "attack":
        if (this.action) { Object.assign(P, game.combat.actionPose(this, this.action)); rate = 40; }
        break;
      case "pose": {
        const a = this.poseAct;
        if (a) Object.assign(P, POSES[a.id].pose(clamp(a.t / a.dur, 0, 1), clamp((a.t - a.dur) / a.rel, 0, 1), this, game));
        rate = 24;
        break;
      }
    }
    // занос при развороте на бегу: корпус откинут против движения, ноги широко, руки для баланса
    if (this.skid > 0 && (st === "run" || st === "walk" || st === "idle")) Object.assign(P, { lean: -0.32, legAmp: 0.2, legSpread: 2.0, bodyY: 2, armF: 1.0, armB: -1.2, sx: 1.04, sy: 0.94, cloak: -0.9, headTilt: 0.1 });
    // жест после убийства: клинок/пистолет прокручивается в руке, голова чуть откинута
    if (this.killT > 0 && (st === "idle" || st === "walk" || st === "run" || st === "land" || st === "jump" || st === "fall" || (st === "attack" && this.action && this.action.phase === "recovery"))) {
      const k = 1 - this.killT / 0.38;
      Object.assign(P, { armF: 1.7, elbowF: 0.5, wBlend: 1, wAngle: -0.6 + TAU * this.killAmt * easeOut(k), headTilt: -0.12, lean: Math.min(P.lean == null ? 0 : P.lean, 0) - 0.04 });
    }
    AnimationSystem.blend(this.anim, P, rate, dt);
    if (P.legPhase != null) this.anim.pose.legPhase = P.legPhase;
    if (this.turnT > 0) this.anim.pose.sx *= 1 - 0.28 * Math.sin(Math.PI * (1 - this.turnT / 0.14));
    AnimationSystem.secondary(this.anim, this, dt);
  }
}
