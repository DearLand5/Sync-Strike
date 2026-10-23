/* =====================================================================
   Enemy — базовая логика противников и четыре типа.
   Враги видят игрока с задержкой реакции, просят у AttackDirector
   «жетон» атаки, и назначают удар на ближайшую долю.
   ===================================================================== */
const ENEMY_TYPES = {
  blade:  { name: "Клинок", hp: 50,  speed: 95,  w: 12, h: 30, poise: 24, sight: 560, reach: 34, wind: 0.4,  dmg: 12, cd: [1.2, 2.1], lunge: 330, activeT: 0.14, recoverT: 0.45, score: 100 },
  gunner: { name: "Стрелок", hp: 38, speed: 80,  w: 12, h: 34, poise: 14, sight: 760, prefer: [210, 360], wind: 0.62, dmg: 9, cd: [1.6, 2.6], bolt: 290, activeT: 0.1, recoverT: 0.6, score: 120 },
  swift:  { name: "Вихрь",  hp: 28,  speed: 190, w: 10, h: 24, poise: 12, sight: 640, reach: 120, wind: 0.28, dmg: 8, cd: [0.9, 1.6], lunge: 540, activeT: 0.28, recoverT: 0.4, score: 130 },
  brute:  { name: "Молот",  hp: 185, speed: 55,  w: 22, h: 50, poise: 70, sight: 560, reach: 48, wind: 0.85, dmg: 22, cd: [2.2, 3.2], activeT: 0.16, recoverT: 0.8, score: 300 },
};

/** Длительность «смерти» до исчезновения: тяжёлый Молот падает дольше. */
const DEAD_DUR = { blade: 0.5, gunner: 0.55, swift: 0.45, brute: 0.85 };

let _enemyId = 1;
class Enemy {
  constructor(kind, x, y, diff) {
    const T = ENEMY_TYPES[kind];
    this.id = _enemyId++;
    this.kind = kind; this.T = T;
    this.look = ENEMY_LOOKS[kind];
    this.variant = randi(0, 2);
    this.scale = this.look.scale;
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.w = T.w; this.h = T.h;
    this.facing = 1; this.onGround = true; this.platform = null; this.dropT = 0;
    this.maxHp = Math.round(T.hp * diff.hp); this.hp = this.maxHp;
    this.poiseMax = T.poise; this.poise = T.poise;
    this.state = "spawn"; this.stateT = 0;
    this.anim = new AnimState();
    this.alive = true; this.dead = false;
    this.flash = 0; this.eyeBoost = 0; this.alpha = 0;
    this.attackCD = rand(0.6, 1.2);
    this.hasToken = false;
    this.windT = 0; this.windDur = 0.5;
    this.aim = { x: 0, y: 0 };
    this.seenX = x; this.seenY = 0; this.reactT = 0;
    this.goalX = x; this.relocT = 0;
    this.tauntT = 0;
    this.hitIds = new Set();
    this.weapon = this.look.weapon;
    this.scarfColor = kind === "swift" ? this.look.accent : null;
    this.groundY = 0;
    this.diff = diff;
    this.dodgeCD = 0;
    this.runPhase = rand(0, 6);
    this.passive = false;     // для обучения: не атакует
    this.hitKick = 0;         // визуальная реакция на удар (затухает), не влияет на геймплей
    this.deathStyle = null;   // split | slam | shot | topple — особая смерть после добивания
    this.deathDir = 1; this.deathRot = 0; this.tdPose = null;
  }

  get targetable() { return this.alive && this.state !== "spawn" && !this.executed; }
  get centerY() { return this.y - this.h * this.scale * 0.5; }
  setState(s) { if (this.state !== s) { this.state = s; this.stateT = 0; } }

  /** Урон по врагу. Возвращает true, если стойкость сломана (оглушение). */
  damage(amount, dirX, knock, game, stun = 0.3) {
    if (!this.alive || this.state === "spawn") return false;
    this.hp -= amount;
    this.flash = 1;
    this.hitKick = 1;
    // суперброня: начатый удар (вторая половина замаха и сам удар) не прерывается;
    // после оглушения — короткая защита от повторного, чтобы не было бесконечного станлока
    const armored = (this.state === "windup" && this.windT > this.windDur * 0.5) || this.state === "attack" || this.staggerImmune > 0;
    if (!armored) this.poise -= amount;
    const broke = !armored && this.poise <= 0;
    if (this.hp <= 0) { this.die(dirX, game); return true; }
    if (broke) {
      this.staggerImmune = 1.1;
      this.poise = this.poiseMax;
      this.cancelAttack(game);
      this.setState("hurt"); this.hurtDur = stun;
      this.vx = dirX * knock; this.vy = this.onGround ? -knock * 0.35 : -60;
    } else if (!armored) {
      this.vx += dirX * knock * 0.25;
    }
    return broke;
  }

  die(dirX, game) {
    this.alive = false;
    this.cancelAttack(game);
    this.setState("dead");
    this.deathDir = dirX || 1;
    this.vx = dirX * 160; this.vy = -180;
  }

  cancelAttack(game) {
    if (this.hasToken) { game.director.release(this); this.hasToken = false; }
    this.windT = 0;
  }

  update(dt, game) {
    const T = this.T, pl = game.player;
    this.stateT += dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.hitKick = Math.max(0, this.hitKick - dt * 5);
    this.attackCD -= dt;
    this.dodgeCD = Math.max(0, this.dodgeCD - dt);
    this.tauntT = Math.max(0, this.tauntT - dt);
    this.dropT = Math.max(0, this.dropT - dt);
    this.poise = Math.min(this.poiseMax, this.poise + dt * this.poiseMax * 0.25);
    this.staggerImmune = Math.max(0, (this.staggerImmune || 0) - dt);

    if (this.executed) {      // добивание: позиции задаёт сценарий
      this.flash = Math.max(0, this.flash - dt * 6);      // под замедлением вспышка не должна висеть: силуэт врага остаётся читаемым
      this.queuePose(dt, game);
      return;
    }
    if (this.state === "spawn") {
      this.alpha = clamp(this.stateT / 0.6, 0, 1);
      if (this.stateT > 0.65) this.setState("think");
      this._physics(dt);
      this.queuePose(dt, game);
      return;
    }
    if (this.state === "dead") {
      const dd = this.deathStyle === "split" ? 0.5 : DEAD_DUR[this.kind];
      this.alpha = clamp((dd - this.stateT) / 0.22, 0, 1);       // растворяется только в конце падения
      this.vx = damp(this.vx, 0, 4, dt);
      this.vy += 900 * dt;
      this._physics(dt);
      this.queuePose(dt, game);
      if (this.stateT > dd) this.dead = true;
      return;
    }
    this.alpha = 1;

    // восприятие с задержкой реакции
    this.reactT -= dt;
    if (this.reactT <= 0) { this.seenX = pl.x; this.seenY = pl.y; this.reactT = rand(0.15, 0.3); }
    const dx = this.seenX - this.x, dist = Math.abs(dx), dirToP = sign(dx);
    const playerVisible = pl.alive && dist < T.sight;
    const aggro = game.aggression();   // 0.7 интенсивно .. 1.3 спокойно

    switch (this.state) {
      case "think": this._think(dt, game, dx, dist, dirToP, playerVisible, aggro); break;
      case "windup": this._windup(dt, game); break;
      case "attack": this._attack(dt, game); break;
      case "recover":
        this.vx = damp(this.vx, 0, 8, dt);
        if (this.stateT > T.recoverT * (this.kind === "brute" ? 1 : aggro)) {
          if (this.hasToken) { game.director.release(this); this.hasToken = false; }
          this.attackCD = rand(T.cd[0], T.cd[1]) * aggro * this.diff.cd;
          this.setState("think");
        }
        break;
      case "hurt":
        this.vx = damp(this.vx, 0, 5, dt);
        if (this.stateT > (this.hurtDur || 0.3)) this.setState("think");
        break;
    }
    this._physics(dt);
    this.groundY = this.onGround ? this.y : groundBelow(this.x, this.y);
    this.queuePose(dt, game);
  }

  _physics(dt) {
    this.vy = Math.min(this.vy + 1500 * dt, 700);
    moveBody(this, dt);
  }

  _walk(dir, speed, dt) {
    const target = dir * speed;
    this.vx = damp(this.vx, target, 8, dt);
    if (Math.abs(this.vx) > 10) this.runPhase += Math.abs(this.vx) * dt * 0.08;
  }

  _think(dt, game, dx, dist, dirToP, visible, aggro) {
    const T = this.T, pl = game.player;
    if (!visible) { this._walk(0, 0, dt); return; }
    this.facing = dirToP;
    const sp = T.speed * (aggro < 1 ? 1.15 : 0.9);
    const canAttack = this.attackCD <= 0 && !this.passive && pl.alive && pl.state !== "victory";
    const sameLevel = Math.abs(pl.y - this.y) < 40;

    // реакция на атаку игрока: шаг назад (с шансом)
    if (pl.action && pl.action.phase !== "recovery" && dist < 70 && this.dodgeCD <= 0 && this.kind !== "brute" && Math.random() < 0.012 * (this.kind === "swift" ? 3 : 1)) {
      this.vx = -dirToP * 260; this.vy = -160; this.dodgeCD = 2.5;
      return;
    }

    if (this.kind === "blade" || this.kind === "brute") {
      if (dist > T.reach * 0.85 || !sameLevel) this._walk(dirToP, sp, dt);
      else this._walk(0, 0, dt);
      // спрыгнуть или запрыгнуть следом за игроком
      if (this.onGround && pl.y < this.y - 60 && dist < 140 && this.kind === "blade" && Math.random() < 0.02) this.vy = -520;
      if (this.onGround && this.platform && pl.y > this.y + 40 && Math.random() < 0.03) { this.dropT = 0.3; this.y += 2; }
      if (canAttack && dist <= T.reach && sameLevel) this._requestAttack(game);
    } else if (this.kind === "gunner") {
      // держать дистанцию, иногда менять позицию
      this.relocT -= dt;
      if (this.relocT <= 0) {
        const side = Math.random() < 0.7 ? -dirToP : dirToP;
        this.goalX = clamp(pl.x + side * rand(T.prefer[0], T.prefer[1]), 60, WORLD.w - 60);
        this.relocT = rand(2.5, 4.5);
      }
      if (dist < T.prefer[0] * 0.8) this.goalX = clamp(this.x - dirToP * 120, 60, WORLD.w - 60);
      const gd = this.goalX - this.x;
      if (Math.abs(gd) > 12) this._walk(sign(gd), sp, dt); else this._walk(0, 0, dt);
      this.facing = dirToP;
      if (canAttack && dist < T.prefer[1] * 1.4) this._requestAttack(game);
    } else if (this.kind === "swift") {
      // кружит вокруг игрока, меняя стороны
      this.relocT -= dt;
      if (this.relocT <= 0) { this.goalX = clamp(pl.x + (Math.random() < 0.5 ? -1 : 1) * rand(100, 180), 40, WORLD.w - 40); this.relocT = rand(0.8, 1.6); }
      const gd = this.goalX - this.x;
      if (Math.abs(gd) > 10) this._walk(sign(gd), sp, dt); else this._walk(0, 0, dt);
      this.facing = dirToP;
      if (this.onGround && Math.random() < 0.006) this.vy = -380;
      if (canAttack && dist < T.reach * 1.3 && dist > 50 && sameLevel) this._requestAttack(game);
    }
    // идле-реакция на сильную долю
    if (game.strongBeatNow && Math.random() < 0.3) this.tauntT = 0.3;
  }

  _requestAttack(game) {
    if (!game.director.request(this)) return;
    this.hasToken = true;
    // удар назначается на долю: не раньше минимального замаха
    const now = game.songNow;
    const wind = this.T.wind * this.diff.wind;
    const strikeAt = game.clock.nextBeatAfter(now, wind);
    this.windDur = clamp(strikeAt - now, wind, wind + 0.65);
    this.windT = 0;
    this.setState("windup");
    this.vx *= 0.3;
    game.sfx("telegraph", this.kind === "brute");
  }

  _windup(dt, game) {
    const pl = game.player;
    this.windT += dt;
    this.vx = damp(this.vx, 0, 10, dt);
    const lockT = this.windDur - 0.15;     // прицел фиксируется за 0.15 с до удара
    if (this.windT < lockT) {
      this.facing = sign(pl.x - this.x);
      this.aim.x = pl.x; this.aim.y = pl.y - 16;
    }
    this.eyeBoost = clamp(this.windT / this.windDur, 0, 1);
    if (this.windT >= this.windDur) {
      this.setState("attack");
      this.hitIds.clear();
      const T = this.T;
      if (this.kind === "blade") { this.vx = this.facing * T.lunge; game.sfx("enemySwing"); }
      else if (this.kind === "swift") {
        this.vx = this.facing * T.lunge; this.vy = -140; game.sfx("dash");
      } else if (this.kind === "gunner") {
        const hp = CharacterRenderer.handWorld(this, 14);
        const ang = Math.atan2(this.aim.y - hp.y, this.aim.x - hp.x);
        game.combat.spawnProjectile({ x: hp.x, y: hp.y, vx: Math.cos(ang) * T.bolt * this.diff.bolt, vy: Math.sin(ang) * T.bolt * this.diff.bolt, owner: "enemy", dmg: T.dmg * this.diff.dmg, r: 4, color: this.look.accent, life: 3, src: this });
        game.fx.sparks(hp.x, hp.y, 5, this.look.accent, 160, ang, 0.8);
        game.sfx("enemyShot");
      } else if (this.kind === "brute") {
        game.sfx("slam");
        game.camera.shake(0.45);
        const fx = this.x + this.facing * 30;
        game.fx.shockwave(fx, this.y, this.look.accent, 150);
        game.fx.dust(fx, this.y, 12, "#2a2633");
        // ударные волны по полу в обе стороны (перепрыгиваются)
        for (const d of [-1, 1]) game.combat.spawnProjectile({ x: fx, y: this.y - 5, vx: d * 300, vy: 0, owner: "enemy", dmg: T.dmg * 0.6 * this.diff.dmg, r: 6, color: this.look.accent, life: 1.1, wave: true, src: this });
      }
    }
  }

  _attack(dt, game) {
    const T = this.T;
    if (this.kind === "blade" || this.kind === "swift") this.vx = damp(this.vx, 0, this.kind === "swift" ? 1.5 : 7, dt);
    if (this.kind === "swift") game.addAfterimage(this);
    else this.vx = 0;
    // хитбокс атаки ближнего боя
    if (this.kind !== "gunner") {
      const reach = this.kind === "brute" ? 46 : this.kind === "swift" ? 26 : 30;
      const box = { x: this.facing > 0 ? this.x : this.x - reach, y: this.y - this.h * this.scale, w: reach, h: this.h * this.scale };
      game.combat.enemyHit(this, box, T.dmg * this.diff.dmg);
    }
    if (this.stateT >= T.activeT) this.setState("recover");
  }

  /** Смерть зависит от типа врага и от того, как он убит. deathRot — поворот всего тела вокруг ступней (рисует CombatSystem.drawEnemy). */
  _deathPose(P, t) {
    const d = this.deathDir, style = this.deathStyle, kind = this.kind;
    let rot = 0;
    if (style === "split") { Object.assign(P, { lean: -0.2, armF: -1.0, armB: -1.2, bodyY: 1 }); }
    else if (style === "slam") {
      const k = easeOut(clamp(t / 0.12, 0, 1));
      Object.assign(P, { lean: 0.1, bodyY: 3 * k, sy: 1 - 0.2 * k, sx: 1 + 0.1 * k, armF: 1.0, armB: 0.8, headTilt: 0.3 });
      rot = d * 0.35 * easeOut(clamp((t - 0.1) / 0.3, 0, 1));
    } else if (style === "shot") {
      Object.assign(P, { lean: -0.7, armF: -1.4, armB: -1.5, headTilt: -0.5, bodyY: 1, tuck: 0.4 });
      rot = d * 1.3 * easeOut(clamp(t / 0.3, 0, 1));
    } else if (kind === "brute" || style === "topple") {
      // колено → пауза → тяжёлое падение назад
      const k = clamp((t - 0.3) / 0.45, 0, 1);
      Object.assign(P, { lean: -0.3, armF: lerp(0.8, -1.2, k), armB: -0.9, bodyY: 3 + 3 * easeOut(clamp(t / 0.3, 0, 1)), sy: 0.9, headTilt: -0.4, legSpread: 1.6 });
      rot = d * 1.5 * easeIn(k);
    } else if (kind === "gunner") {
      // ноги подкашиваются, падает вперёд лицом
      const k = clamp((t - 0.22) / 0.3, 0, 1);
      Object.assign(P, { lean: lerp(0.1, 0.5, k), armF: lerp(0.9, 1.4, k), armB: 0.7, bodyY: 1 + 5 * easeOut(clamp(t / 0.22, 0, 1)), sy: 0.9, headTilt: 0.4, legSpread: 1.5 });
      rot = -d * 1.4 * easeIn(k);
    } else if (kind === "swift") {
      // закручивается в воздухе и обрушивается
      Object.assign(P, { lean: -0.4, armF: -1.2, armB: -1.4, tuck: 0.8, bodyY: 1, spin: d * TAU * easeOut(clamp(t / 0.32, 0, 1)) });
      rot = d * 1.45 * easeIn(clamp((t - 0.3) / 0.15, 0, 1));
    } else {
      // клинок: отброшен ударом, летит спиной вперёд и падает
      Object.assign(P, { lean: -0.6, armF: -1.2, armB: -1.4, headTilt: -0.5, bodyY: 2, sy: 0.92, tuck: 0.3 });
      rot = d * 1.35 * easeOut(clamp(t / 0.35, 0, 1));
    }
    this.deathRot = rot;
  }

  /** Поза считается раз в кадр (не на каждом шаге физики): время копится и применяется в flushPose. */
  queuePose(dt, game) { if (game.deferPose) this._poseDt = (this._poseDt || 0) + dt; else this._pose(dt, game); }
  flushPose(game) { if (this._poseDt > 0) { const dt = this._poseDt; this._poseDt = 0; this._pose(dt, game); } }

  _pose(dt, game) {
    const c = game.clock, st = this.state, t = this.stateT;
    const P = {};
    let rate = 14;
    const moving = Math.abs(this.vx) > 15 && this.onGround;
    const base = { legPhase: this.runPhase, legAmp: moving ? clamp(Math.abs(this.vx) / 150, 0.3, 1) : 0, legSpread: 1, tuck: this.onGround ? 0 : 0.4, sx: 1, sy: 1, wBlend: 0, headTilt: 0, cloak: 0 };
    Object.assign(P, base);
    const gun = this.kind === "gunner";
    const aimArm = () => {
      const hp = { x: this.x, y: this.y - 20 * this.scale };
      const ang = Math.atan2(this.aim.y - hp.y, (this.aim.x - hp.x) * this.facing);
      return Math.PI / 2 - ang;
    };
    switch (st) {
      case "spawn":
        Object.assign(P, { bodyY: (1 - t / 0.6) * 6, sy: 0.7 + 0.3 * clamp(t / 0.6, 0, 1), armF: 0.3, armB: -0.3, lean: 0.2 });
        break;
      case "think":
        Object.assign(P, { bodyY: c.pulse * 1.0 + Math.sin(performance.now() / 520 + this.id * 1.7) * 0.35, sy: 1 - c.pulse * 0.05, sx: 1 + c.pulse * 0.03, lean: moving ? 0.18 : 0.05, armF: gun ? 0.5 : 0.7, elbowF: gun ? 0.2 : 0.8, armB: -0.3 });
        if (this.tauntT > 0) Object.assign(P, { lean: -0.18, armF: 2.6, elbowF: 0.2, headTilt: -0.25 });
        break;
      case "windup": {
        const k = clamp(this.windT / this.windDur, 0, 1);
        if (gun) Object.assign(P, { armF: aimArm(), elbowF: 0, lean: -0.05, armB: 0.9, bodyY: 1 });
        else if (this.kind === "brute") Object.assign(P, { armF: lerp(0.5, 3.4, easeOut(k)), elbowF: 0.1, lean: -0.25 * k, bodyY: -1.5 * k, sy: 1 + 0.06 * k });
        else Object.assign(P, { armF: lerp(0.7, -1.9, easeOut(k)), elbowF: 0.4, lean: -0.15 * k + (this.kind === "swift" ? 0.3 : 0), bodyY: 1.5 * k, sx: 1 + 0.06 * k, sy: 1 - 0.08 * k });
        rate = 20;
        break;
      }
      case "attack":
        if (gun) Object.assign(P, { armF: aimArm() - 0.35, elbowF: 0, lean: -0.15 });
        else if (this.kind === "brute") Object.assign(P, { armF: 0.6, elbowF: 0.2, lean: 0.45, bodyY: 3, sx: 1.12, sy: 0.88 });
        else Object.assign(P, { armF: 2.2, elbowF: 0.3, lean: 0.4, bodyY: 1, legAmp: 0.6, legPhase: 1 });
        rate = 45;
        break;
      case "recover":
        Object.assign(P, { armF: gun ? 0.6 : 1.2, elbowF: 0.6, lean: 0.12, bodyY: 0.5 });
        break;
      case "executed": {
        // оглушён и удерживается на месте: ровная стойка, без дрожи; каждый удар сценария — отклон назад с возвратом
        Object.assign(P, { lean: -0.25, armF: -0.9, armB: -1.3, headTilt: -0.3, bodyY: 1.5, sy: 0.97, tuck: this.y < -5 ? 0.5 : 0, legSpread: 1.3 });
        if (this.tdPose) Object.assign(P, this.tdPose);
        P.lean -= 0.28 * this.hitKick; P.headTilt -= 0.2 * this.hitKick; P.sx = 1 - 0.05 * this.hitKick;
        rate = 26;
        break;
      }
      case "hurt": {
        // реакция на удар: резкий отклон назад (hitKick), согнутые колени, затем неустойчивая стойка до конца оглушения
        const hk = this.hitKick;
        Object.assign(P, { lean: -0.22 - 0.35 * hk, armF: -0.6 - 0.4 * hk, armB: -1.0 - 0.3 * hk, headTilt: -0.3, bodyY: 1.5 + 1.2 * hk, sx: 1 - 0.06 * hk, sy: 0.96 + 0.04 * hk, tuck: this.onGround ? 0 : 0.5 });
        rate = 34;
        break;
      }
      case "dead": this._deathPose(P, t); rate = 24; break;
    }
    // лёгкий отклон на любое попадание (в том числе по врагу с суперброней)
    if (st !== "hurt" && st !== "executed" && st !== "dead" && this.hitKick > 0) { P.lean = (P.lean || 0) - 0.14 * this.hitKick; P.sy = (P.sy || 1) - 0.04 * this.hitKick; }
    if (st !== "windup") this.eyeBoost = Math.max(0, this.eyeBoost - dt * 3);
    AnimationSystem.blend(this.anim, P, rate, dt);
    this.anim.pose.legPhase = this.runPhase;
    AnimationSystem.secondary(this.anim, this, dt);
  }
}
