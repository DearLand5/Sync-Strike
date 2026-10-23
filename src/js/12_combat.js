/* =====================================================================
   CombatSystem — выбор цели и атаки, хитбоксы, урон, комбо, очки.
   AttackDirector — справедливое распределение атак врагов.
   WaveDirector — волны, спавн по сильным долям, режимы.
   ===================================================================== */

/* Атаки игрока. impact — время от старта до удара (для подгонки к доле). */
const ATTACKS = {
  slash1:   { kind: "melee",  startup: 0.06, active: 0.08, recovery: 0.17, cancel: 0.11, dmg: 12, reach: 30, knock: 150, stun: 0.25, lunge: 120, arc: [-2.3, 0.7], name: "Нокс-9" },
  slash2:   { kind: "melee",  startup: 0.05, active: 0.08, recovery: 0.17, cancel: 0.1,  dmg: 12, reach: 30, knock: 150, stun: 0.25, lunge: 140, arc: [0.9, -2.0], name: "Нокс-9" },
  slash3:   { kind: "melee",  startup: 0.08, active: 0.1,  recovery: 0.26, cancel: 0.2,  dmg: 22, reach: 40, knock: 330, stun: 0.45, lunge: 170, arc: [-2.8, 2.6], spin: true, name: "Нокс-вихрь" },
  // восходящий разрез — на сильной доле: подбрасывает врага и игрока
  rise:     { kind: "melee",  startup: 0.06, active: 0.1,  recovery: 0.22, cancel: 0.14, dmg: 15, reach: 32, knock: 60,  stun: 0.6,  lunge: 60,  arc: [-0.3, 3.1], launch: true, name: "Восходящий разрез" },
  // укол — для нажатий мимо доли: быстрый прямой выпад
  thrust:   { kind: "melee",  startup: 0.05, active: 0.07, recovery: 0.15, cancel: 0.1,  dmg: 13, reach: 42, knock: 200, stun: 0.25, lunge: 230, thrust: true, name: "Укол" },
  airSlash: { kind: "melee",  startup: 0.05, active: 0.08, recovery: 0.14, cancel: 0.1,  dmg: 11, reach: 30, knock: 160, stun: 0.25, lunge: 0, arc: [-2.0, 1.4], moveControl: 0.6, name: "Нокс-9" },
  airSpin:  { kind: "melee",  startup: 0.04, active: 0.14, recovery: 0.12, cancel: 0.1,  dmg: 13, reach: 34, knock: 170, stun: 0.3,  lunge: 0, arc: [-2.8, 2.6], spin: true, flip: true, moveControl: 0.6, name: "Сальто-вихрь" },
  dash:     { kind: "dash",   startup: 0.05, active: 0.09, recovery: 0.17, cancel: 0.12, dmg: 16, reach: 30, knock: 220, stun: 0.35, speed: 1050, maxTravel: 0.17, arc: [-2.4, 1.2], name: "Рывок" },
  shot:     { kind: "ranged", startup: 0.05, active: 0.02, recovery: 0.16, cancel: 0.09, dmg: 8,  speed: 900, knock: 90, stun: 0.15, moveControl: 0.35, name: "Импульс-7" },
  // двойной выстрел двумя руками — на сильной доле
  twin:     { kind: "ranged", startup: 0.05, active: 0.09, recovery: 0.18, cancel: 0.13, dmg: 8,  speed: 950, knock: 110, stun: 0.2, shots: 2, gap: 0.07, twoHand: true, name: "Двойной импульс" },
  // от бедра — быстрый выстрел для неточных нажатий
  hip:      { kind: "ranged", startup: 0.03, active: 0.02, recovery: 0.13, cancel: 0.08, dmg: 7,  speed: 880, knock: 80, stun: 0.12, hip: true, moveControl: 0.5, name: "От бедра" },
  // сальто назад с выстрелом — когда игрок отходит от врага
  backShot: { kind: "ranged", startup: 0.04, active: 0.18, recovery: 0.2,  cancel: 0.3,  dmg: 11, speed: 950, knock: 140, stun: 0.2, backflip: true, fireAt: 0.12, name: "Отскок-выстрел" },
  charged:  { kind: "ranged", startup: 0.09, active: 0.02, recovery: 0.24, cancel: 0.16, dmg: 20, speed: 1150, knock: 240, stun: 0.35, pierce: true, name: "Импульс-заряд" },
  dive:     { kind: "dive",   startup: 0.04, active: 0.35, recovery: 0.1,  cancel: 0.1,  dmg: 14, reach: 22, knock: 120, stun: 0.3, name: "Пике" },
};
const RATING_ORDER = ["perfect", "good", "early", "late", "miss"];

class CombatSystem {
  constructor(game) {
    this.game = game;
    this.projectiles = [];
    this.reset();
  }
  reset() {
    this.projectiles.length = 0;
    this.score = 0; this.kills = 0;
    this.combo = 0; this.maxCombo = 0; this.comboT = 0;
    this.chain = 0;            // серия точных нажатий
    this.ratings = { perfect: 0, good: 0, early: 0, late: 0, miss: 0 };
    this.perfectDodges = 0; this.damageTaken = 0; this.hits = 0;
    this.lastRating = null; this.lastRatingT = 0;
    this.lastTarget = null;
    this.comboStep = 0; this.lastMeleeT = -9;
    this.lastAction = null; this.lastActionT = -9; this.lastSlash3HitT = -9;
    this.shotChain = 0;
    this.buffer = null;        // отложенное нажатие {song, real}
    this.time = 0;
    this.comboLabel = ""; this.comboLabelT = 0;
    this.td = null; this.lastTdT = -9; this.takedowns = 0;
    this.airCount = 0; this.lastRiseT = -9;
  }

  /* ---------- ввод ---------- */
  onAttackPress(songT) {
    const p = this.game.player;
    if (!p.alive || p.state === "victory") return;
    const act = p.action;
    const busy = !p.canAct || (act && act.t < act.cancel);
    if (busy) { this.buffer = { song: songT, real: this.time }; return; }
    this.execute(songT);
  }

  /** Отложенное нажатие исполняется, как только персонаж может действовать (окно 0.22 с). */
  updateBuffer() {
    const b = this.buffer;
    if (!b) return;
    if (this.time - b.real > 0.22) { this.buffer = null; return; }
    const p = this.game.player, act = p.action;
    if (p.canAct && (!act || act.t >= act.cancel)) { this.buffer = null; this.execute(b.song); }
  }

  execute(pressSong) {
    const g = this.game, p = g.player, clock = g.clock;
    const j = clock.judge(pressSong);
    const target = this.selectTarget();
    const name = this.chooseAttack(target, j);
    const def = ATTACKS[name];
    this.registerRating(j);

    // мощность: точность × сильная доля × контратака после идеального уклона
    let power = RATING[j.rating].mult;
    const empowered = j.rating === "perfect" && j.strong;
    if (empowered) power *= 1.3;
    if (p.counterT > 0) { power *= 1.5; p.counterT = 0; this.flashLabel("КОНТРУДАР"); }

    const act = {
      name, def, t: 0, phase: "startup", target, judge: j, power, empowered,
      startup: def.startup, active: def.active, recovery: def.recovery, cancel: def.cancel,
      hit: new Set(), fired: false, iframes: false, noGravity: false, dir: p.facing,
      travel: 0, startX: p.x, startY: p.y,
    };
    if (target) { act.dir = sign(target.x - p.x); p.facing = act.dir; }

    // рывок: время пути до цели
    if (def.kind === "dash" && target) {
      const dist = Math.max(0, Math.abs(target.x - p.x) - target.w * target.scale * 0.5 - 14);
      act.travel = Math.min(def.maxTravel, dist / def.speed);
      act.dashTo = target.x - act.dir * (target.w * target.scale * 0.5 + 12);
    }
    // подгонка к доле: раннее нажатие растягивает подготовку, чтобы удар пришёлся точно на долю
    const impact = act.startup + (def.kind === "dash" ? act.travel : 0);
    if (g.settings.v.assist) {
      const toBeat = j.beatTime - g.songNow;
      const maxHold = Math.min(0.16, 0.3 * j.period);
      if (toBeat > impact && toBeat - impact < maxHold) act.startup += toBeat - impact;
    }
    act.total = act.startup + act.travel + act.active + act.recovery;
    act.cancel = Math.min(def.cancel + (act.startup - def.startup) + act.travel, act.total);
    p.action = act;
    p.setState("attack");
    p.eyeBoost = j.rating === "perfect" ? 1 : 0.4;

    // связки
    const since = this.time - this.lastActionT;
    if (def.kind === "ranged" && this.time - this.lastSlash3HitT < 0.6) { act.echo = true; act.power *= 1.25; this.flashLabel("ЭХО"); }
    if (def.kind === "dash" && this.lastAction && ATTACKS[this.lastAction].kind === "ranged" && since < 0.6) { act.duet = true; act.power *= 1.2; this.flashLabel("ДУЭТ"); }
    if (def.kind === "melee") { this.comboStep = name === "slash1" ? 1 : name === "slash2" ? 2 : name === "slash3" ? 3 : this.comboStep; this.lastMeleeT = this.time; }
    if (def.kind === "ranged") this.shotChain = since < 0.7 && this.lastAction && ATTACKS[this.lastAction].kind === "ranged" ? this.shotChain + 1 : 1;
    else this.shotChain = 0;
    this.lastAction = name; this.lastActionT = this.time;

    // звук и вспышки
    if (def.kind === "dash") { g.sfx("dash"); }
    else if (def.kind === "melee" || def.kind === "dive") g.sfx("slash", name === "slash3" || name === "rise" ? 1.4 : 1);
    if (def.kind === "ranged") p.pistolT = 0.6;
    if (def.backflip) { p.vx = -act.dir * 240; p.vy = -330; p.onGround = false; act.noGravity = false; }
    if (name === "rise") { this.lastRiseT = this.time; }
    if (name === "airSlash" || name === "airSpin") this.airCount++;
    if (["rise", "thrust", "twin", "backShot", "airSpin"].includes(name)) this.flashLabel(def.name.toUpperCase());
    if (j.rating === "perfect") g.sfx("perfect");
  }

  registerRating(j) {
    this.ratings[j.rating]++;
    this.lastRating = j.rating; this.lastRatingT = this.time;
    if (j.rating === "perfect" || j.rating === "good") this.chain++;
    else this.chain = 0;
    const p = this.game.player;
    const R = RATING[j.rating];
    this.game.fx.text(p.x, p.y - 52, R.label, R.color, j.rating === "perfect" ? 15 : 12, 0.7);
  }

  flashLabel(s) { this.comboLabel = s; this.comboLabelT = 1.2; }

  /* ---------- цель и выбор атаки ---------- */
  selectTarget() {
    const g = this.game, p = g.player;
    let best = null, bs = -1e9;
    const pushing = Math.abs(g.input.moveX) > 0.3 ? sign(g.input.moveX) : 0;
    for (const e of g.enemies) {
      if (!e.targetable) continue;
      const dx = e.x - p.x, adx = Math.abs(dx);
      const dy = e.centerY - p.centerY;
      if (adx > 520 || Math.abs(dy) > 240) continue;
      let s = -adx - Math.abs(dy) * 0.8;
      if (sign(dx) === p.facing) s += 110;
      if (pushing && sign(dx) === pushing) s += 90;
      if (e === this.lastTarget) s += 60;
      s += (1 - e.hp / e.maxHp) * 30;
      if (e.state === "windup") s += 40;        // угроза в приоритете
      if (s > bs) { bs = s; best = e; }
    }
    this.lastTarget = best;
    return best;
  }

  chooseAttack(target, j) {
    const g = this.game, p = g.player;
    const air = !p.onGround;
    const good = j.rating === "perfect" || j.rating === "good";
    const sloppy = j.rating === "early" || j.rating === "late" || j.rating === "miss";
    const nextSlash = () => {
      const recent = this.time - this.lastMeleeT < 0.75;
      if (!recent || this.comboStep >= 3) return sloppy ? "thrust" : "slash1";
      return this.comboStep === 1 ? "slash2" : "slash3";
    };
    if (!target) return air ? (this.airCount % 2 ? "airSpin" : "airSlash") : nextSlash();
    const dx = Math.abs(target.x - p.x) - (target.w * target.scale) / 2 - p.w / 2;
    const dy = target.centerY - p.centerY;
    const away = Math.abs(g.input.moveX) > 0.4 && sign(g.input.moveX) !== sign(target.x - p.x);
    if (air) {
      if (dy > 22 && Math.abs(target.x - p.x) < 70) return "dive";
      if (dx < 40 && Math.abs(dy) < 45) return j.rating === "perfect" || this.airCount % 2 ? "airSpin" : "airSlash";
      return good && j.strong ? "twin" : "shot";
    }
    if (dx <= 34 && Math.abs(dy) < 40) {
      if (away) return "backShot";
      // сильная доля + точность: подброс (не чаще раза в 2 с, Молота не подбросить)
      if (j.strong && good && target.kind !== "brute" && this.time - this.lastRiseT > 2 && this.comboStep !== 2) return "rise";
      return nextSlash();
    }
    const dashRange = 170 + (good ? 40 : 0);
    if (dx <= dashRange && Math.abs(dy) < 45 && !away) {
      if (j.rating === "miss" && dx > 110) return "hip";
      return "dash";
    }
    if (this.shotChain >= 2 && j.rating === "perfect") return "charged";
    if (good && j.strong) return "twin";
    if (sloppy) return "hip";
    return "shot";
  }

  /* ---------- исполнение действия (вызывается из Player.update) ---------- */
  updateAction(p, act, dt) {
    const g = this.game, def = act.def;
    act.t += dt;
    const tA = act.startup + act.travel;           // начало активной фазы
    act.phase = act.t < act.startup ? "startup" : act.t < tA ? "travel" : act.t < tA + act.active ? "active" : "recovery";

    if (def.kind === "melee") {
      if (act.phase === "startup") p.vx = damp(p.vx, 0, 12, dt);
      if (act.phase === "active" && !act.fired) {
        act.fired = true;
        if (p.onGround) p.vx = act.dir * def.lunge;
        if (def.launch && p.onGround) { p.vy = -330; p.onGround = false; p.airJumps = 1; }
        if (def.thrust) this._thrustFx(p, act); else this._slashFx(p, act);
        if (def.thrust || def.launch) g.addAfterimage(p);
      }
      if (act.phase === "active") this._meleeHits(p, act, def.spin);
      if (act.phase === "recovery") p.vx = damp(p.vx, 0, 10, dt);
    } else if (def.kind === "dash") {
      if (act.phase === "startup") { p.vx = damp(p.vx, 0, 15, dt); }
      if (act.phase === "travel") {
        act.iframes = true; act.noGravity = true; p.vy = 0;
        const to = act.dashTo != null ? act.dashTo : p.x + act.dir * 120;
        const k = clamp((act.t - act.startup) / Math.max(0.01, act.travel), 0, 1);
        const nx = lerp(act.startX, to, easeOut(k));
        p.vx = (nx - p.x) / Math.max(dt, 1e-4);
        g.addAfterimage(p);
      }
      if (act.phase === "active") {
        act.iframes = false; act.noGravity = false;
        if (!act.fired) { act.fired = true; p.vx = act.dir * 60; this._slashFx(p, act); }
        this._meleeHits(p, act, false);
      }
      if (act.phase === "recovery") p.vx = damp(p.vx, 0, 10, dt);
      if (act.phase === "startup") act.startX = p.x;
    } else if (def.kind === "ranged") {
      const t0 = act.startup + (def.fireAt || 0);
      const shots = def.shots || 1;
      act.shotsFired = act.shotsFired || 0;
      while (act.shotsFired < shots && act.t >= t0 + act.shotsFired * (def.gap || 0)) {
        this._fire(p, act, act.shotsFired);
        act.shotsFired++;
        act.fired = true;
      }
      if (def.backflip && act.phase === "active") g.addAfterimage(p);
    } else if (def.kind === "dive") {
      if (act.phase === "startup") { p.vy = Math.min(p.vy, -60); p.vx *= 0.5; }
      else if (act.phase === "active" || act.phase === "travel") {
        p.vy = 560; act.noGravity = true;
        this._meleeHits(p, act, false, true);
        if (p.onGround) { act.t = tA + act.active; g.fx.dust(p.x, p.y, 6); g.camera.shake(0.15); }
      }
    }
    if (act.t >= act.total) {
      p.action = null;
      p.setState(p.onGround ? "idle" : "fall");
    }
  }

  /** Поза атаки для AnimationSystem: у каждого приёма своя анимация. */
  actionPose(p, act) {
    const def = act.def, P = { tuck: 0, legAmp: 0, legSpread: 1.25, sx: 1, sy: 1, wBlend: 0, headTilt: 0, armB: -0.6, elbowF: 0.15, bodyY: 0.5, spin: 0 };
    const tA = act.startup + act.travel;
    const kS = clamp(act.t / Math.max(0.01, act.startup), 0, 1);
    const kA = clamp((act.t - tA) / Math.max(0.01, act.active), 0, 1);
    const kR = clamp((act.t - tA - act.active) / Math.max(0.01, act.recovery), 0, 1);
    const aimAt = () => {
      const tg = act.target, hy = p.y - 20;
      return tg ? Math.atan2(tg.centerY - hy, Math.abs(tg.x - p.x)) : 0;
    };
    if (def.thrust) {
      // укол: оттянуть руку и выбросить клинок прямо вперёд
      const arm = act.phase === "startup" ? lerp(0.3, -0.7, easeOut(kS)) : act.phase === "active" ? Math.PI / 2 : lerp(Math.PI / 2, 0.4, easeInOut(kR));
      Object.assign(P, { armF: arm, elbowF: act.phase === "startup" ? 1.4 : 0, wBlend: act.phase === "startup" ? 0 : 1, wAngle: 0,
        lean: act.phase === "startup" ? -0.15 : act.phase === "active" ? 0.45 : 0.2 * (1 - kR), legSpread: 1.7, bodyY: act.phase === "active" ? 2.5 : 1, sx: act.phase === "active" ? 1.12 : 1, sy: act.phase === "active" ? 0.92 : 1, cloak: -0.6 });
    } else if (def.launch) {
      // восходящий разрез: снизу вверх с прыжком
      const arm = act.phase === "startup" ? lerp(0.3, -0.5, easeOut(kS)) : act.phase === "active" ? lerp(-0.5, 3.1, easeOut(kA)) : lerp(3.1, 0.6, easeInOut(kR));
      Object.assign(P, { armF: arm, elbowF: 0.1, lean: act.phase === "startup" ? 0.25 : -0.18, bodyY: act.phase === "startup" ? 3 : -1, sx: act.phase === "startup" ? 1.12 : 0.92, sy: act.phase === "startup" ? 0.88 : 1.12, tuck: p.onGround ? 0 : 0.3, headTilt: -0.2, armB: -1.4 });
    } else if (def.kind === "melee" || def.kind === "dash") {
      const [a0, a1] = def.arc;
      const back = a0 - 0.4, fwd = a1;
      let arm;
      if (act.phase === "startup") arm = lerp(0.3, back, easeOut(kS));
      else if (act.phase === "travel") arm = back;
      else if (act.phase === "active") arm = lerp(back, fwd, easeOut(kA));
      else arm = lerp(fwd, 0.4, easeInOut(kR));
      Object.assign(P, { armF: arm, lean: act.phase === "startup" ? -0.12 : act.phase === "travel" ? 0.6 : act.phase === "active" ? 0.3 : 0.15 * (1 - kR) });
      if (act.phase === "travel") Object.assign(P, { tuck: 0.4, sx: 1.15, sy: 0.88, cloak: -0.8, bodyY: 2 });
      if (def.spin && act.phase === "active") Object.assign(P, { sx: 1.1, sy: 0.92, bodyY: 2, cloak: -1 });
      if (def.flip) P.spin = act.phase === "active" ? TAU * easeInOut(kA) : 0;   // сальто в воздухе
      if (!p.onGround) P.tuck = 0.4;
      // чередуем стойку: второй удар — с разворотом корпуса
      if (act.name === "slash2") Object.assign(P, { headTilt: 0.12, armB: 0.6 });
    } else if (def.kind === "ranged") {
      const ang = aimAt();
      const fireT = act.startup + (def.fireAt || 0);
      const since = act.t - fireT;
      const recoil = since > 0 ? Math.max(0, 1 - since / 0.12) : 0;
      const aim = Math.PI / 2 - ang;
      Object.assign(P, { armF: aim - recoil * 0.45, elbowF: 0, lean: -0.05 - recoil * 0.12, armB: 0.4, bodyY: recoil * 1.2 });
      if (def.twoHand) Object.assign(P, { armB: aim - recoil * 0.4, legSpread: 1.6, bodyY: 1.5 + recoil, lean: 0.05 });
      if (def.hip) Object.assign(P, { armF: aim + 0.25 - recoil * 0.3, elbowF: -0.5, lean: 0.18, bodyY: 1.8, legSpread: 1.5, headTilt: 0.1 });
      if (def.backflip) {
        const k = clamp(act.t / (act.startup + act.active), 0, 1);
        Object.assign(P, { spin: -TAU * easeInOut(k), tuck: 0.7 * Math.sin(k * Math.PI), legAmp: 0 });
      }
      if (def.pierce && act.phase === "startup") Object.assign(P, { bodyY: 2, sy: 0.9, sx: 1.08, lean: 0.1 });
      if (!p.onGround && !def.backflip) Object.assign(P, { tuck: 0.35, lean: -0.15 });
    } else if (def.kind === "dive") {
      Object.assign(P, { armF: 0.15, elbowF: 0, wBlend: 1, wAngle: Math.PI / 2, lean: 0.25, tuck: 0.6, sx: 0.9, sy: 1.12 });
    }
    return P;
  }

  _thrustFx(p, act) {
    const g = this.game, col = p.skin.accent, y = p.y - 20;
    const x0 = p.x + act.dir * 6, x1 = p.x + act.dir * (act.def.reach + 18);
    g.fx.line(x0, y, x1, y, col, 5, 0.16);
    g.fx.line(x0, y, x1, y, "#ffffff", 1.5, 0.1);
    g.fx.sparks(x1, y, 4, col, 160, act.dir > 0 ? 0 : Math.PI, 0.6, 0.2);
  }

  _slashFx(p, act) {
    const g = this.game, def = act.def, col = p.skin.accent;
    const cx = p.x + act.dir * 6, cy = p.y - 20;
    const r = def.spin ? 34 : 26;
    const [a0, a1] = def.arc;
    // дуга в мировых углах: локальные углы руки → экранные
    const toWorld = a => (act.dir > 0 ? Math.PI / 2 - a : Math.PI / 2 + a);
    let w0 = toWorld(a0 - 0.4), w1 = toWorld(a1);
    if (act.dir < 0) { const t = w0; w0 = w1; w1 = t; }
    if (w1 < w0) w1 += TAU;
    g.fx.slashArc(cx, cy, r, w0, w1, col, act.empowered ? 9 : 6, 0.2);
    g.fx.slashArc(cx, cy, r - 5, w0, w1, "#ffffff", 2, 0.12);
    if (def.spin) g.fx.ring(cx, cy, 10, 48, col, 0.3, 3);
  }

  _meleeHits(p, act, spin, dive = false) {
    const g = this.game, def = act.def;
    const reach = def.reach;
    const box = dive
      ? { x: p.x - 14, y: p.y - 10, w: 28, h: 26 }
      : spin
        ? { x: p.x - reach, y: p.y - 38, w: reach * 2, h: 40 }
        : { x: act.dir > 0 ? p.x - 4 : p.x - reach + 4, y: p.y - 34, w: reach, h: 36 };
    for (const e of g.enemies) {
      if (!e.targetable || act.hit.has(e.id)) continue;
      const eb = { x: e.x - e.w * e.scale / 2, y: e.y - e.h * e.scale, w: e.w * e.scale, h: e.h * e.scale };
      if (!rectsOverlap(box, eb)) continue;
      act.hit.add(e.id);
      this._applyHit(e, act, sign(e.x - p.x) || act.dir, e.x, e.centerY);
      if (dive) { p.vy = -400; act.t = act.startup + act.travel + act.active; p.airJumps = 1; this.flashLabel("ПРОБОЙ"); }
    }
  }

  _fire(p, act, n = 0) {
    const g = this.game, def = act.def;
    const hand = CharacterRenderer.handWorld(p, 8);
    if (n === 1) hand.y += 3;
    let ang;
    if (act.target) ang = Math.atan2(act.target.centerY - hand.y, act.target.x - hand.x);
    else ang = act.dir > 0 ? 0 : Math.PI;
    this.spawnProjectile({ x: hand.x, y: hand.y, vx: Math.cos(ang) * def.speed, vy: Math.sin(ang) * def.speed, owner: "player", act, r: def.pierce ? 6 : 3.5, color: p.skin.accent, life: 0.9, pierce: !!def.pierce });
    g.fx.sparks(hand.x, hand.y, act.empowered ? 9 : 5, p.skin.accent, 240, ang, 0.7, 0.2);
    g.fx.ring(hand.x, hand.y, 2, act.empowered ? 18 : 11, "#ffffff", 0.14, 2);
    g.sfx("shot", def.pierce);
    g.camera.kick(0.004);
  }

  spawnProjectile(o) { o.hit = new Set(); this.projectiles.push(o); }

  /** Попадание по врагу: урон, отбрасывание, комбо, эффекты. */
  _applyHit(e, act, dirX, hx, hy) {
    const g = this.game, def = act.def, j = act.judge;
    const dmg = def.dmg * act.power * g.diff.playerDmg;
    // смертельный точный удар — кинематографичное добивание
    if (e.hp - dmg <= 0 && this.canTakedown(e, act)) {
      this.combo++; this.comboT = 3; this.hits++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.startTakedown(e, act, dirX);
      return true;
    }
    const broke = e.damage(dmg, dirX, def.knock * (act.empowered ? 1.3 : 1), g, def.stun);
    const killed = !e.alive;
    if (def.launch && !killed && e.kind !== "brute") { e.vy = -430; e.vx = dirX * 40; e.onGround = false; }
    const perfect = j.rating === "perfect";
    // комбо и очки
    this.combo++; this.comboT = 3; this.hits++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const comboMult = 1 + Math.min(this.combo, 40) / 20;
    const chainMult = 1 + Math.min(this.chain, 10) * 0.1;
    this.score += Math.round(50 * RATING[j.rating].score * comboMult * chainMult * (act.empowered ? 1.5 : 1));
    if ([10, 25, 50, 100].includes(this.combo)) { g.sfx("combo", this.combo / 10); this.flashLabel(this.combo + " КОМБО"); }
    if (act.name === "slash3") this.lastSlash3HitT = this.time;
    // эффекты по силе
    const col = g.player.skin.accent;
    g.sfx("hit", killed ? 1.3 : act.empowered ? 1.2 : 1, perfect);
    g.fx.sparks(hx, hy, perfect ? 14 : 8, col, perfect ? 340 : 240, dirX > 0 ? 0 : Math.PI, 1.6);
    g.fx.sparks(hx, hy, 4, "#ffffff", 200, null);
    g.fx.ring(hx, hy, 4, perfect ? 30 : 20, perfect ? "#ffffff" : col, 0.22, perfect ? 3 : 2);
    // один стоп-кадр на атаку (вихрь по нескольким целям, пробивающая пуля); частые выстрелы — вдвое короче
    if (!act.stopped) { act.stopped = true; g.hitstop((perfect ? 0.075 : 0.045) * (def.kind === "ranged" && !def.pierce ? 0.5 : 1)); }
    g.camera.shake(act.empowered ? 0.35 : perfect ? 0.22 : 0.12);
    g.camera.kick(perfect ? 0.02 : 0.008);
    if (killed) this._onKill(e, act);
    // особо зрелищные моменты — замедление времени
    if ((act.name === "slash3" && perfect && j.strong) || (killed && act.empowered)) {
      g.slowmo(0.4, 0.3, "flair");
      this.flashLabel(act.name === "slash3" ? "НОКС-ВИХРЬ" : "ФИНАЛ");
    } else if (act.name === "slash3") this.flashLabel("НОКС-ВИХРЬ");
    if (def.kind === "ranged" && act.def.pierce) this.flashLabel("ЗАРЯД");
    return broke;
  }

  _onKill(e, act, cinematic = false) {
    const g = this.game;
    this.kills++;
    this.score += Math.round(e.T.score * (1 + Math.min(this.combo, 40) / 40));
    g.sfx("death");
    g.fx.shards(e.x, e.centerY, e.kind === "brute" ? 26 : 14, e.look.accent, 260);
    g.fx.shards(e.x, e.centerY, 6, "#0b0c10", 200);
    g.fx.ring(e.x, e.centerY, 6, e.kind === "brute" ? 60 : 36, e.look.accent, 0.4, 3);
  }

  /* ---------- добивания (takedown) ---------- */
  canTakedown(e, act) {
    // в толпе кинематографичные добивания реже — иначе они идут почти подряд
    let alive = 0; for (const x of this.game.enemies) if (x.alive) alive++;
    const cd = 4.5 + 0.5 * Math.max(0, alive - 3);
    if (this.td || this.time - this.lastTdT < cd || !e.alive || e.executed) return false;
    const r = act.judge.rating;
    return e.kind === "brute" || r === "perfect" || r === "good" || this.combo >= 6;
  }

  startTakedown(e, act, dirX) {
    const g = this.game, p = g.player, def = act.def;
    let kind;
    if (e.kind === "brute") kind = "colossus";
    else if (def.kind === "ranged") kind = "volley";
    else if (def.launch || def.kind === "dive" || !p.onGround || !e.onGround) kind = "sky";
    else kind = "xcut";
    const dur = { xcut: 0.78, sky: 0.95, volley: 0.72, colossus: 1.15 }[kind];
    e.executed = true; e.hp = Math.max(0.01, e.hp); e.cancelAttack(g);
    e.setState("executed"); e.vx = 0; e.vy = 0;
    p.action = null; p.scripted = true; p.setState("takedown"); p.vx = 0; p.vy = 0;
    p.facing = sign(e.x - p.x) || p.facing;
    this.td = { kind, t: 0, dur, e, dir: p.facing, px: p.x, py: p.y, ex: e.x, ey: e.y, step: 0, act, speed: 1 };
    this.takedowns++;
    this.lastTdT = this.time;
    g.hitstop(0.07);
    // если бюджет замедлений исчерпан — сценарий играется в ускоренном темпе без замедления времени
    const slowed = g.slowmo(dur + 0.15, kind === "colossus" ? 0.25 : 0.35, "takedown");
    if (!slowed) this.td.speed = 1.65;
    g.camera.focus(lerp(p.x, e.x, 0.6), e.centerY - 6, kind === "colossus" ? 1.35 : 1.45);
    g.letterboxTarget = 1;
    g.sfx("perfect");
    const names = { xcut: "РАССЕЧЕНИЕ", sky: "НЕБЕСНАЯ КАЗНЬ", volley: "РАССТРЕЛ", colossus: "ПАДЕНИЕ КОЛОССА" };
    this.flashLabel(names[kind]);
    g.takedownTitle = names[kind]; g.takedownTitleT = 1.4;
  }

  /** Сценарий добивания; идёт в реальном времени (поверх замедления). */
  updateTakedown(dt) {
    const td = this.td;
    if (!td) return;
    const g = this.game, p = g.player, e = td.e, col = p.skin.accent, ec = e.look.accent;
    td.t += dt * td.speed;
    const t = td.t, cy = e.y - e.h * e.scale * 0.5;
    const events = td.events || (td.events = new Set());
    const once = (key, time, fn) => { if (t >= time && !events.has(key)) { events.add(key); fn(); } };

    if (td.kind === "xcut") {
      once("dash", 0.1, () => {
        const nx = clamp(e.x + td.dir * 30, 40, WORLD.w - 40);
        for (let i = 0; i <= 6; i++) { p.x = lerp(td.px, nx, i / 6); g._aiT = 0; g.addAfterimage(p); }
        p.x = nx; p.facing = -td.dir;
        g.fx.line(e.x - 26, cy - 26, e.x + 26, cy + 26, col, 6, 0.5);
        g.fx.line(e.x - 26, cy - 26, e.x + 26, cy + 26, "#ffffff", 2, 0.35);
        g.sfx("dash"); g.sfx("slash", 1.4); g.camera.shake(0.25); e.flash = 1;
      });
      once("cut2", 0.26, () => {
        g.fx.line(e.x + 26, cy - 26, e.x - 26, cy + 26, col, 6, 0.5);
        g.fx.line(e.x + 26, cy - 26, e.x - 26, cy + 26, "#ffffff", 2, 0.35);
        g.sfx("slash", 1.5); g.hitstop(0.05); e.flash = 1;
      });
      once("kill", 0.46, () => this._finishTakedown(true));
    } else if (td.kind === "sky") {
      const k = clamp(t / 0.4, 0, 1);
      if (t < 0.5) {
        e.y = Math.min(td.ey, td.ey - 120 * easeOut(k)) ; e.x = td.ex;
        p.y = td.py - (td.py - (td.ey - 145)) * easeOut(clamp(t / 0.35, 0, 1)); p.x = lerp(td.px, td.ex - td.dir * 10, easeOut(k));
      }
      for (const hitT of [0.18, 0.26, 0.34]) once("h" + hitT, hitT, () => {
        const a = rand(0, TAU);
        g.fx.slashArc(e.x, e.y - 15, 22, a, a + 2.4, col, 5, 0.2);
        g.fx.sparks(e.x, e.y - 15, 6, col, 220, null); g.sfx("hit", 0.8); e.flash = 1; g.camera.shake(0.12);
      });
      if (t >= 0.5 && t < 0.62) {
        const k2 = clamp((t - 0.5) / 0.12, 0, 1);
        e.y = lerp(td.ey - 120, 0, easeIn(k2)); p.y = lerp(td.ey - 145, -20, easeIn(k2)) ;
        g.addAfterimage(p);
      }
      once("slam", 0.62, () => { e.y = 0; p.y = -2; this._finishTakedown(true); g.fx.shockwave(e.x, 0, col, 180); g.fx.dust(e.x, 0, 14); });
    } else if (td.kind === "volley") {
      p.pistolT = 0.8;
      for (const st of [0.06, 0.16, 0.26]) once("s" + st, st, () => this._tracer(p, e, 2, false));
      once("final", 0.44, () => { this._tracer(p, e, 5, true); this._finishTakedown(true); });
    } else if (td.kind === "colossus") {
      const spots = [[0.15, -1], [0.32, 1], [0.49, -1]];
      for (const [st, side] of spots) once("c" + st, st, () => {
        const nx = clamp(e.x + side * 40, 40, WORLD.w - 40);
        g._aiT = 0; g.addAfterimage(p);
        p.x = nx; p.facing = -side;
        const a = side > 0 ? 2.4 : -0.7;
        g.fx.slashArc(e.x, e.y - 30, 34, a, a + 2.2, col, 7, 0.3);
        g.fx.sparks(e.x, e.y - 30, 10, ec, 260, null); g.sfx("hit", 1.2); e.flash = 1; g.camera.shake(0.25);
      });
      e.anim.pose.lean = -0.6 * clamp((t - 0.5) / 0.3, 0, 1);
      once("fall", 0.8, () => { this._finishTakedown(true); g.fx.shockwave(e.x, 0, ec, 260); g.fx.shockwave(e.x, 0, "#ffffff", 160); g.fx.dust(e.x, 0, 20, "#2a2633"); g.sfx("slam"); });
    }
    if (t >= td.dur) {
      this.td = null;
      p.scripted = false;
      if (p.state === "takedown") p.setState(p.onGround ? "idle" : "fall");
      p.iframes = Math.max(p.iframes, 0.35);
      g.camera.release();
      g.letterboxTarget = 0;
    }
  }

  _tracer(p, e, w, big) {
    const g = this.game, col = p.skin.accent;
    const h = CharacterRenderer.handWorld(p, 8);
    const cy = e.y - e.h * e.scale * 0.5;
    g.fx.line(h.x, h.y, e.x + (big ? sign(e.x - p.x) * 200 : 0), cy, col, w * 1.6, big ? 0.4 : 0.15);
    g.fx.line(h.x, h.y, e.x, cy, "#ffffff", w * 0.5, 0.12);
    g.fx.ring(h.x, h.y, 2, big ? 22 : 12, "#ffffff", 0.15, 2);
    g.fx.sparks(e.x, cy, big ? 14 : 6, col, 260, sign(e.x - p.x) > 0 ? 0 : Math.PI, 1.4);
    g.sfx("shot", big); g.sfx("bulletHit");
    e.flash = 1; e.x += sign(e.x - p.x) * 3;
    g.camera.kick(big ? 0.03 : 0.01); g.camera.shake(big ? 0.35 : 0.12);
  }

  _finishTakedown() {
    const td = this.td, g = this.game, e = td.e, p = g.player;
    e.executed = false;
    e.hp = 0;
    e.die(td.dir, g);
    this._onKill(e, td.act, true);
    this.score += 500;
    g.flashT = 1;
    g.hitstop(0.09);
    g.camera.shake(td.kind === "colossus" ? 0.9 : 0.6);
    g.camera.kick(0.05);
    g.sfx("hit", 1.6, true);
    // разлёт на две половины + большой взрыв осколков
    g.fx.shards(e.x, e.centerY, e.kind === "brute" ? 40 : 26, e.look.accent, 380);
    g.fx.shards(e.x, e.centerY, 14, p.skin.accent, 320);
    g.fx.ring(e.x, e.centerY, 8, e.kind === "brute" ? 110 : 70, "#ffffff", 0.5, 4);
    g.fx.ring(e.x, e.centerY, 4, e.kind === "brute" ? 80 : 50, p.skin.accent, 0.6, 3);
  }

  /** Вражеский хитбокс по игроку (вызывается из Enemy). */
  enemyHit(enemy, box, dmg) {
    const g = this.game, p = g.player;
    if (!p.alive || enemy.hitIds.has("p")) return;
    const pb = { x: p.x - p.w / 2, y: p.y - p.h, w: p.w, h: p.h };
    if (!rectsOverlap(box, pb)) return;
    enemy.hitIds.add("p");
    this._hitPlayer(dmg, enemy.x);
  }

  _hitPlayer(dmg, fromX) {
    const g = this.game, p = g.player;
    if (p.state === "dodge" && p.stateT < g.diff.perfectDodge && !p.perfectDodgeUsed) {
      // идеальный уклон: удар пришёлся в самое начало уклонения
      p.perfectDodgeUsed = true;
      this.perfectDodges++;
      this.score += 300;
      p.counterT = 1.0;
      g.slowmo(0.5, 0.3, "dodge");
      g.sfx("perfect");
      g.fx.ring(p.x, p.y - 16, 6, 44, p.skin.accent, 0.4, 3);
      this.flashLabel("ИДЕАЛЬНЫЙ УКЛОН");
      return;
    }
    if (p.invulnerable || p.scripted) return;
    if (p.hurt(dmg, fromX, g)) {
      this.damageTaken += dmg;
      this.combo = 0; this.chain = 0;
      g.sfx("hurt");
      g.camera.shake(0.45);
      g.hurtFlash = 1;
      g.fx.sparks(p.x, p.y - 16, 10, "#ff2d4a", 220, null);
    }
  }

  update(dt) {
    const g = this.game;
    this.time += dt;
    this.comboT -= dt;
    if (this.comboT <= 0 && this.combo > 0) this.combo = 0;
    this.comboLabelT = Math.max(0, this.comboLabelT - dt);
    if (g.player.state !== "dodge") g.player.perfectDodgeUsed = false;
    this.updateBuffer();
    // снаряды
    const P = this.projectiles;
    for (let i = P.length - 1; i >= 0; i--) {
      const b = P[i];
      b.life -= dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      let remove = b.life <= 0 || b.x < 0 || b.x > WORLD.w || b.y > 4 || b.y < -500;
      if (b.wave) b.y = -5;
      if (!remove && b.owner === "player") {
        for (const e of g.enemies) {
          if (!e.targetable || b.hit.has(e.id)) continue;
          const eb = { x: e.x - e.w * e.scale / 2 - b.r, y: e.y - e.h * e.scale - b.r, w: e.w * e.scale + b.r * 2, h: e.h * e.scale + b.r * 2 };
          if (b.x > eb.x && b.x < eb.x + eb.w && b.y > eb.y && b.y < eb.y + eb.h) {
            b.hit.add(e.id);
            this._applyHit(e, b.act, sign(b.vx), b.x, b.y);
            g.sfx("bulletHit");
            if (!b.pierce) { remove = true; break; }
          }
        }
      } else if (!remove && b.owner === "enemy") {
        const p = g.player;
        if (p.alive && !b.hit.has("p")) {
          const top = p.y - p.h;
          const inside = b.wave ? Math.abs(b.x - p.x) < 10 && p.y > -14 : b.x > p.x - p.w / 2 - b.r && b.x < p.x + p.w / 2 + b.r && b.y > top - b.r && b.y < p.y + b.r;
          if (inside) {
            b.hit.add("p");
            const before = p.hp;
            this._hitPlayer(b.dmg, b.x - b.vx * 0.01);
            if (p.hp < before || !b.wave) remove = true;
          }
        }
      }
      if (remove) {
        if (b.life > 0 && !b.wave) g.fx.sparks(b.x, b.y, 4, b.color, 140, null, Math.PI, 0.2);
        P.splice(i, 1);
      }
    }
  }

  drawProjectiles(ctx, hq) {
    for (const b of this.projectiles) {
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const len = b.wave ? 0 : b.owner === "player" ? 22 : 12;
      if (b.wave) {
        ctx.fillStyle = rgba(b.color, 0.8);
        ctx.beginPath(); ctx.moveTo(b.x - 10, 0); ctx.quadraticCurveTo(b.x, -16, b.x + 10, 0); ctx.fill();
        continue;
      }
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(b.x - b.vx / sp * len, b.y - b.vy / sp * len); ctx.lineTo(b.x, b.y);
      if (hq) { ctx.strokeStyle = rgba(b.color, 0.3); ctx.lineWidth = b.r * 1.4; ctx.stroke(); }
      ctx.strokeStyle = b.owner === "player" ? "#ffffff" : b.color; ctx.lineWidth = b.r * 0.45; ctx.stroke();
      ctx.fillStyle = b.owner === "player" ? "#ffffff" : b.color; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.5, 0, TAU); ctx.fill();
    }
  }
}

/* ---------- AttackDirector ---------- */
class AttackDirector {
  constructor(game) { this.game = game; this.reset(); }
  reset() { this.active = new Set(); this.lastStart = -9; this.lastSide = 0; this.maxTokens = 1; this.maxRanged = 1; }
  setLimits(tokens, ranged) { this.maxTokens = tokens; this.maxRanged = ranged; }
  request(e) {
    const g = this.game, now = g.combat.time;
    for (const a of this.active) if (!a.alive || !g.enemies.includes(a)) this.active.delete(a);
    if (this.active.size >= this.maxTokens) return false;
    if (e.kind === "gunner") {
      let r = 0; for (const a of this.active) if (a.kind === "gunner") r++;
      if (r >= this.maxRanged) return false;
    }
    const side = sign(e.x - g.player.x);
    // атака с другой стороны требует большего зазора — без атак «со всех сторон сразу»
    const gap = (this.lastSide && side !== this.lastSide && this.active.size > 0 ? 0.7 : 0.35) * g.diff.gap;
    if (now - this.lastStart < gap) return false;
    this.active.add(e);
    this.lastStart = now; this.lastSide = side;
    return true;
  }
  release(e) { this.active.delete(e); }
}

/* ---------- WaveDirector ---------- */
const WAVES = [
  ["blade", "blade", "blade", "blade"],
  ["blade", "blade", "gunner", "swift", "blade"],
  ["blade", "swift", "gunner", "swift", "blade", "gunner", "blade"],
  ["brute", "blade", "gunner", "blade", "swift", "blade", "swift"],
  ["swift", "gunner", "blade", "swift", "gunner", "blade", "blade", "swift"],
  ["brute", "swift", "gunner", "blade", "brute", "swift", "gunner", "blade", "blade"],
];
const PRACTICE_STEPS = [
  { text: "Двигайтесь: джойстик слева или A / D", check: g => g.player.moveDist > 220 },
  { text: "Прыгните, а в воздухе прыгните ещё раз", check: g => g.player.didDoubleJump },
  { text: "Атакуйте в такт: кольцо внизу сжимается к доле", spawn: [["blade", true]], check: g => g.combat.ratings.perfect + g.combat.ratings.good >= 4 || g.combat.kills >= 1 },
  { text: "Враг вспыхивает перед ударом — нажмите «Уклон» в момент удара", spawn: [["blade", false]], check: g => g.combat.perfectDodges >= 1 || g.player.dodgeCount >= 3 },
  { text: "Стрелок держит дистанцию: атака издалека — выстрел", spawn: [["gunner", false]], check: g => g.combat.kills >= 3 },
  { text: "Свободный бой. Выйти — через паузу", free: true },
];

class WaveDirector {
  constructor(game) { this.game = game; this.reset("waves"); }
  reset(mode) {
    this.mode = mode;
    this.wave = 0; this.queue = []; this.between = 1.2; this.spawnTimer = 0;
    this.done = false; this.banner = ""; this.bannerT = 0;
    this.step = 0; this.stepT = 0; this.freeT = 0;
    this.trackSpawnT = 2;
  }
  get totalWaves() { return WAVES.length; }

  aliveCount() { return this.game.enemies.filter(e => e.alive).length; }

  update(dt) {
    const g = this.game;
    this.bannerT = Math.max(0, this.bannerT - dt);
    if (this.done || !g.player.alive) return;
    const strongBeat = g.clock.events.some(e => e.type === "strongBeat");
    const beat = g.clock.events.some(e => e.type === "beat");
    this.spawnTimer -= dt;

    if (this.mode === "practice") return this._practice(dt, strongBeat || beat);

    if (this.mode === "track") {
      // натиск следует за энергией музыки
      const I = g.clock.intensitySmooth;
      const prog = g.audio.duration ? clamp(g.songNow / g.audio.duration, 0, 1) : 0;
      const target = Math.round(2 + I * 3.5 + prog * 1.8 + g.diff.extra);
      const n = 1 + Math.round(I * 3 + prog * 2);   // «условная волна» по энергии и прогрессу трека
      g.director.setLimits(clamp(g.diff.tokens(n), 1, 3), g.diff.ranged(n));
      this.wave = 1 + Math.floor(prog * 5);
      if (this.aliveCount() < target && (beat || this.spawnTimer < -1.2) && this.spawnTimer <= 0) {
        const pool = ["blade", "blade", "gunner"];
        if (prog > 0.15 || I > 0.6) pool.push("swift");
        if (prog > 0.35 && I > 0.55) pool.push("brute");
        if (I > 0.7) pool.push("swift", "gunner");
        const kind = pick(pool);
        if (kind !== "brute" || !g.enemies.some(e => e.alive && e.kind === "brute")) this.spawn(kind);
        this.spawnTimer = 0.45;
      }
      return;
    }

    // режим «Волны»
    if (this.between > 0) {
      this.between -= dt;
      if (this.between <= 0) this.startWave(this.wave + 1);
      return;
    }
    const maxAlive = g.diff.alive(this.wave);
    if (this.queue.length && this.aliveCount() < maxAlive && this.spawnTimer <= 0 && (beat || this.spawnTimer < -1.2)) {
      this.spawn(this.queue.shift());
      this.spawnTimer = 0.35;
    }
    if (!this.queue.length && this.aliveCount() === 0) {
      if (this.wave >= WAVES.length) { this.done = true; g.onVictory(); }
      else {
        this.between = 2.4;
        this.showBanner("ВОЛНА " + this.wave + " ПРОЙДЕНА");
        g.player.hp = Math.min(g.player.maxHp, g.player.hp + Math.round(g.player.maxHp * g.diff.waveHeal));
        g.sfx("heal");
      }
    }
  }

  startWave(n) {
    const g = this.game;
    this.wave = n;
    this.queue = WAVES[n - 1].slice();
    this.showBanner("ВОЛНА " + n + " / " + WAVES.length);
    g.sfx("waveStart");
    g.director.setLimits(clamp(g.diff.tokens(n), 1, 3), g.diff.ranged(n));
    this.spawnTimer = 0.3;
  }

  showBanner(s) { this.banner = s; this.bannerT = 2.2; }

  /** Появление врага рядом с игроком (в кадре), с порталом. */
  spawn(kind, passive = false) {
    const g = this.game, p = g.player;
    const cands = [];
    for (const side of [-1, 1]) for (const d of [115, 150, 185, 220]) cands.push({ x: p.x + side * d, y: 0 });
    if (kind === "gunner") {
      for (const side of [-1, 1]) cands.push({ x: p.x + side * 240, y: 0 });
      for (const pl of WORLD.platforms) if (Math.abs(pl.x + pl.w / 2 - p.x) < 300) cands.push({ x: pl.x + pl.w / 2, y: pl.y });
    }
    let best = null, bs = -1e9;
    // с какой стороны врагов меньше — туда и ставим, чтобы не толпились
    let left = 0, right = 0;
    for (const e of g.enemies) if (e.alive) (e.x < p.x ? left++ : right++);
    for (const c of cands) {
      if (c.x < 50 || c.x > WORLD.w - 50) continue;
      const d = Math.abs(c.x - p.x);
      let s = -Math.abs(d - (kind === "gunner" ? 230 : 150)) + rand(0, 50);
      s -= (c.x < p.x ? left : right) * 40;
      for (const e of g.enemies) if (e.alive && Math.abs(e.x - c.x) < 45 && Math.abs(e.y - c.y) < 30) s -= 300;
      if (s > bs) { bs = s; best = c; }
    }
    if (!best) best = { x: clamp(p.x + 160, 60, WORLD.w - 60), y: 0 };
    const e = new Enemy(kind, best.x, best.y, g.diff);
    e.passive = passive;
    e.facing = sign(p.x - e.x);
    e.attackCD += g.diff.spawnGrace;      // появились близко — даём время на реакцию
    g.enemies.push(e);
    g.sfx("spawn");
    g.fx.ring(e.x, e.y - 18, 4, 40, e.look.accent, 0.6, 2);
    g.fx.sparks(e.x, e.y - 10, 10, e.look.accent, 140, -Math.PI / 2, 1.2, 0.5);
    return e;
  }

  _practice(dt, beat) {
    const g = this.game;
    const st = PRACTICE_STEPS[this.step];
    if (!st) return;
    this.stepT += dt;
    if (this.stepT < 0.05 && st.spawn) for (const [k, passive] of st.spawn) this.spawn(k, passive);
    if (st.free) {
      g.director.setLimits(2, 1);
      if (this.aliveCount() < 2 && this.spawnTimer <= 0 && beat) { this.spawn(pick(["blade", "gunner", "swift"])); this.spawnTimer = 2; }
      return;
    }
    g.director.setLimits(1, 1);
    // противники шага, если их убили раньше времени — возвращаются
    if (st.spawn && this.aliveCount() === 0 && this.stepT > 1 && !st.check(g)) { for (const [k, passive] of st.spawn) this.spawn(k, passive); this.stepT = 0.06; }
    if (st.check(g)) {
      this.step++; this.stepT = 0;
      g.sfx("combo", 2);
      this.showBanner("ОТЛИЧНО");
    }
  }
  get practiceText() { const st = PRACTICE_STEPS[this.step]; return st ? st.text : ""; }
}
