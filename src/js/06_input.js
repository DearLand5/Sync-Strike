/* =====================================================================
   InputManager — клавиатура, мышь, сенсор. Нажатия складываются в очередь
   с отметкой времени события, чтобы оценка ритма не зависела от FPS.
   ===================================================================== */
class InputManager {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.keys = new Set();
    this.queue = [];
    this.moveX = 0; this.moveY = 0;
    this.walk = false;
    this.jumpHeld = false;
    this.active = false;        // бой идёт — сенсорные кнопки активны
    this.usingTouch = false;    // было ли касание (показывать кнопки)
    this.touch = new TouchControls(settings);
    this.rotated = false;       // интерфейс повёрнут на 90° (портретный телефон в режиме «горизонтально»)
    this.onPause = null;
    this._bind();
  }

  _bind() {
    const kd = e => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== "range" && e.target.type !== "checkbox") return;
      const c = e.code;
      if (this.active && ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(c)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(c);
      if (!this.active) return;
      if (c === "Space" || c === "KeyW" || c === "ArrowUp") this.push("jump", e.timeStamp);
      else if (c === "KeyJ" || c === "KeyZ" || c === "Enter") this.push("attack", e.timeStamp);
      else if (c === "KeyK" || c === "KeyL" || c === "KeyX" || c === "ShiftRight") this.push("dodge", e.timeStamp);
      else if (c === "Escape" || c === "KeyP") { if (this.onPause) this.onPause(); }
    };
    const ku = e => { this.keys.delete(e.code); };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", () => { this.keys.clear(); this.touch.releaseAll(); this.jumpHeld = false; });

    const cv = this.canvas;
    cv.addEventListener("contextmenu", e => e.preventDefault());
    cv.addEventListener("pointerdown", e => this._down(e));
    cv.addEventListener("pointermove", e => this._move(e));
    cv.addEventListener("pointerup", e => this._up(e));
    cv.addEventListener("pointercancel", e => this._up(e));
    cv.addEventListener("lostpointercapture", e => this._up(e));
    document.addEventListener("gesturestart", e => e.preventDefault());
    document.addEventListener("dblclick", e => { if (e.target === cv) e.preventDefault(); });
  }

  /** Координаты события в системе канваса с учётом поворота интерфейса. */
  local(e) {
    if (this.rotated) return { x: e.clientY, y: window.innerWidth - e.clientX };
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  isTouchPath(e) { return e.pointerType === "touch" || e.pointerType === "pen" || this.settings.v.touchForce || this.touch.editing; }

  _down(e) {
    if (e.pointerType === "touch") this.usingTouch = true;
    if (!this.active && !this.touch.editing) return;
    if (this.isTouchPath(e)) {
      e.preventDefault();
      try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      const q = this.local(e);
      const act = this.touch.down(e.pointerId, q.x, q.y);
      if (act) this.push(act, e.timeStamp);
      if (act === "jump") this.jumpHeld = true;
    } else if (e.pointerType === "mouse") {
      if (e.button === 0) this.push("attack", e.timeStamp);
      else if (e.button === 2) this.push("dodge", e.timeStamp);
    }
  }
  _move(e) {
    if (!this.isTouchPath(e)) return;
    const q = this.local(e);
    this.touch.move(e.pointerId, q.x, q.y);
  }
  _up(e) {
    if (!this.isTouchPath(e)) return;
    const rel = this.touch.up(e.pointerId);
    if (rel === "jump") this.jumpHeld = false;
  }

  push(type, stamp) { this.queue.push({ type, stamp: stamp || performance.now() }); }
  consume() { const q = this.queue; this.queue = []; return q; }
  clear() { this.queue.length = 0; this.touch.releaseAll(); this.jumpHeld = false; }

  /** Сводит клавиатуру и джойстик в оси движения. */
  poll() {
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has("KeyA") || k.has("ArrowLeft")) x -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) x += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) y += 1;
    let walk = k.has("ShiftLeft");
    const j = this.touch.joyValue();
    if (j && (Math.abs(j.x) > 0.01 || Math.abs(j.y) > 0.01)) {
      x = j.x; y = j.y;
      walk = Math.abs(j.x) < 0.65;
    }
    this.moveX = clamp(x, -1, 1);
    this.moveY = clamp(y, -1, 1);
    this.walk = walk;
    const kbJump = k.has("Space") || k.has("KeyW") || k.has("ArrowUp");
    this.jumpHeldAll = kbJump || this.jumpHeld;
  }

  get showTouch() { return this.usingTouch || this.settings.v.touchForce || this.touch.editing; }
}

/* =====================================================================
   TouchControls — раскладка, отрисовка и редактор сенсорных кнопок.
   Координаты в CSS-пикселях канваса.
   ===================================================================== */
const TOUCH_BUTTONS = {
  attack: { label: "АТАКА", k: 1.25 },
  jump:   { label: "ПРЫЖОК", k: 0.9 },
  dodge:  { label: "УКЛОН", k: 0.8 },
};

class TouchControls {
  constructor(settings) {
    this.settings = settings;
    this.w = 800; this.h = 450;
    this.safe = { t: 0, r: 0, b: 0, l: 0 };
    this.btn = {};
    for (const id in TOUCH_BUTTONS) this.btn[id] = { id, x: 0, y: 0, r: 40, pid: null, pressed: false, flash: 0 };
    this.joy = { x: 0, y: 0, r: 60, pid: null, bx: 0, by: 0, kx: 0, ky: 0, vx: 0, vy: 0, active: false };
    this.editing = false;
    this.selected = "attack";
    this.dragPid = null;
    this.onSelect = null;
    this._probe = null;
  }

  readSafeArea() {
    if (!this._probe) {
      const p = document.createElement("div");
      p.style.cssText = "position:absolute;inset:0;visibility:hidden;pointer-events:none;padding:var(--sat) var(--sar) var(--sab) var(--sal)";
      (document.getElementById("app") || document.body).appendChild(p);
      this._probe = p;
    }
    const cs = getComputedStyle(this._probe);
    this.safe = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  }

  resize(w, h) { this.w = w; this.h = h; this.readSafeArea(); this.layout(); }

  baseR() { return clamp(Math.min(this.w, this.h) * 0.1, 30, 72) * clamp(this.settings.v.btnScale, 0.6, 1.5); }

  layout() {
    const L = this.settings.v.layout, s = this.safe;
    const aw = this.w - s.l - s.r, ah = this.h - s.t - s.b;
    const R = this.baseR();
    const place = (o, r) => {
      const x = s.l + o.x * aw, y = s.t + o.y * ah;
      return { x: clamp(x, s.l + r + 4, this.w - s.r - r - 4), y: clamp(y, s.t + r + 4, this.h - s.b - r - 4) };
    };
    for (const id in TOUCH_BUTTONS) {
      const b = this.btn[id], o = L[id];
      b.r = R * TOUCH_BUTTONS[id].k * clamp(o.s, 0.5, 1.7);
      const p = place(o, b.r);
      b.x = p.x; b.y = p.y;
    }
    const jo = L.joy;
    this.joy.r = R * 1.35 * clamp(jo.s, 0.5, 1.7);
    const p = place(jo, this.joy.r);
    this.joy.x = p.x; this.joy.y = p.y;
    if (!this.joy.active) { this.joy.bx = p.x; this.joy.by = p.y; this.joy.kx = p.x; this.joy.ky = p.y; }
  }

  down(pid, x, y) {
    if (this.editing) return this._editDown(pid, x, y);
    // кнопки: ближайшая из попавших (зона на 25% больше видимой)
    let hit = null, hd = 1e9;
    for (const id in this.btn) {
      const b = this.btn[id];
      const d = Math.hypot(x - b.x, y - b.y);
      if (d <= b.r * 1.25 && d < hd && b.pid == null) { hit = b; hd = d; }
    }
    if (hit) { hit.pid = pid; hit.pressed = true; hit.flash = 1; return hit.id; }
    const j = this.joy;
    if (j.pid == null) {
      const floatMode = this.settings.v.joyFloat;
      const inZone = floatMode ? x < this.w * 0.48 && y > this.h * 0.25 : Math.hypot(x - j.x, y - j.y) < j.r * 1.6;
      if (inZone) {
        j.pid = pid; j.active = true;
        if (floatMode) {
          j.bx = clamp(x, this.safe.l + j.r, this.w * 0.5); j.by = clamp(y, this.safe.t + j.r, this.h - this.safe.b - j.r);
        } else { j.bx = j.x; j.by = j.y; }
        this._joyMove(x, y);
      }
    }
    return null;
  }
  move(pid, x, y) {
    if (this.editing) return this._editMove(pid, x, y);
    if (this.joy.pid === pid) this._joyMove(x, y);
  }
  up(pid) {
    if (this.editing) { if (this.dragPid === pid) this.dragPid = null; return null; }
    if (this.joy.pid === pid) { const j = this.joy; j.pid = null; j.active = false; j.vx = j.vy = 0; j.bx = j.x; j.by = j.y; j.kx = j.x; j.ky = j.y; }
    for (const id in this.btn) { const b = this.btn[id]; if (b.pid === pid) { b.pid = null; b.pressed = false; return id; } }
    return null;
  }
  releaseAll() {
    for (const id in this.btn) { this.btn[id].pid = null; this.btn[id].pressed = false; }
    const j = this.joy; j.pid = null; j.active = false; j.vx = j.vy = 0;
    this.dragPid = null;
  }
  _joyMove(x, y) {
    const j = this.joy;
    let dx = x - j.bx, dy = y - j.by;
    const max = j.r * 0.85, d = Math.hypot(dx, dy);
    if (d > max) { dx *= max / d; dy *= max / d; }
    j.kx = j.bx + dx; j.ky = j.by + dy;
    let vx = dx / max, vy = dy / max;
    const dead = 0.18;
    vx = Math.abs(vx) < dead ? 0 : (vx - sign(vx) * dead) / (1 - dead);
    vy = Math.abs(vy) < dead ? 0 : (vy - sign(vy) * dead) / (1 - dead);
    j.vx = vx; j.vy = vy;
  }
  joyValue() { return this.joy.active ? { x: this.joy.vx, y: this.joy.vy } : null; }

  /* ---------- редактор раскладки ---------- */
  _editDown(pid, x, y) {
    let best = null, bd = 1e9;
    const all = Object.assign({ joy: this.joy }, this.btn);
    for (const id in all) {
      const o = all[id], d = Math.hypot(x - o.x, y - o.y);
      if (d < o.r * 1.3 && d < bd) { best = id; bd = d; }
    }
    if (best) {
      this.selected = best; this.dragPid = pid;
      const o = all[best];
      this._dragOff = { x: o.x - x, y: o.y - y };
      if (this.onSelect) this.onSelect(best);
    }
    return null;
  }
  _editMove(pid, x, y) {
    if (pid !== this.dragPid || !this.selected) return;
    const s = this.safe, aw = this.w - s.l - s.r, ah = this.h - s.t - s.b;
    const L = this.settings.v.layout[this.selected];
    L.x = clamp((x + this._dragOff.x - s.l) / aw, 0.03, 0.97);
    L.y = clamp((y + this._dragOff.y - s.t) / ah, 0.08, 0.97);
    this.layout();
  }

  /* ---------- отрисовка ---------- */
  draw(ctx, clock, accent) {
    const alpha = clamp(this.settings.v.btnAlpha, 0.1, 1);
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const j = this.joy;
    const showJoy = j.active || !this.settings.v.joyFloat || this.editing;
    const bx = j.active ? j.bx : j.x, by = j.active ? j.by : j.y;
    ctx.globalAlpha = alpha * (showJoy ? 1 : 0.45);
    ctx.beginPath(); ctx.arc(bx, by, j.r, 0, TAU);
    ctx.fillStyle = "rgba(8,9,13,0.35)"; ctx.fill();
    ctx.strokeStyle = "rgba(232,226,214,0.55)"; ctx.lineWidth = 2; ctx.stroke();
    // засечки направлений
    ctx.beginPath();
    for (const a of [0, Math.PI]) { ctx.moveTo(bx + Math.cos(a) * j.r * 0.72, by); ctx.lineTo(bx + Math.cos(a) * j.r * 0.9, by); }
    ctx.stroke();
    ctx.beginPath(); ctx.arc(j.active ? j.kx : bx, j.active ? j.ky : by, j.r * 0.42, 0, TAU);
    ctx.fillStyle = j.active ? rgba(accent, 0.55) : "rgba(232,226,214,0.18)"; ctx.fill();
    ctx.strokeStyle = j.active ? accent : "rgba(232,226,214,0.6)"; ctx.stroke();

    for (const id in this.btn) {
      const b = this.btn[id];
      const pr = b.pressed ? 0.92 : 1;
      const r = b.r * pr;
      b.flash = Math.max(0, b.flash - 0.06);
      ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, TAU);
      ctx.fillStyle = b.pressed ? rgba(accent, 0.4) : "rgba(8,9,13,0.4)"; ctx.fill();
      ctx.lineWidth = id === "attack" ? 3 : 2;
      ctx.strokeStyle = id === "attack" ? accent : "rgba(232,226,214,0.65)";
      ctx.stroke();
      // кольцо ритма на кнопке атаки — сжимается к доле
      if (id === "attack" && clock) {
        const ph = clock.phase;
        ctx.globalAlpha = alpha * (0.25 + 0.6 * ph);
        ctx.beginPath(); ctx.arc(b.x, b.y, r * (1.55 - 0.55 * ph), 0, TAU);
        ctx.strokeStyle = clock.strongNow && ph < 0.2 ? "#ff2d4a" : accent; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.globalAlpha = alpha;
      }
      this._icon(ctx, id, b.x, b.y, r);
      if (this.editing && this.selected === id) this._selRing(ctx, b.x, b.y, r);
    }
    if (this.editing && this.selected === "joy") this._selRing(ctx, j.x, j.y, j.r);
    if (this.editing) {
      ctx.globalAlpha = 1;
      ctx.font = "600 12px 'JetBrains Mono', monospace"; ctx.textAlign = "center"; ctx.fillStyle = "#e8e2d6";
      for (const id in this.btn) ctx.fillText(TOUCH_BUTTONS[id].label, this.btn[id].x, this.btn[id].y + this.btn[id].r + 16);
      ctx.fillText("ДЖОЙСТИК", j.x, j.y + j.r + 16);
    }
    ctx.restore();
  }
  _selRing(ctx, x, y, r) {
    ctx.save(); ctx.globalAlpha = 1; ctx.setLineDash([6, 6]); ctx.strokeStyle = "#3ef0ff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r + 8, 0, TAU); ctx.stroke(); ctx.restore();
  }
  _icon(ctx, id, x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    const s = r / 40;
    ctx.scale(s, s);
    ctx.strokeStyle = "#e8e2d6"; ctx.fillStyle = "#e8e2d6"; ctx.lineWidth = 3;
    if (id === "attack") {
      // кинжал и искра выстрела
      ctx.beginPath(); ctx.moveTo(-14, 14); ctx.lineTo(10, -10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(10, -10); ctx.lineTo(16, -16); ctx.lineTo(13, -7); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-18, 8); ctx.lineTo(-8, 18); ctx.stroke();
      ctx.beginPath(); ctx.arc(12, 12, 4, 0, TAU); ctx.fill();
    } else if (id === "jump") {
      ctx.beginPath(); ctx.moveTo(-12, 6); ctx.lineTo(0, -8); ctx.lineTo(12, 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-12, 16); ctx.lineTo(0, 2); ctx.lineTo(12, 16); ctx.globalAlpha *= 0.5; ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(10, 0); ctx.moveTo(4, -7); ctx.lineTo(12, 0); ctx.lineTo(4, 7); ctx.stroke();
      ctx.globalAlpha *= 0.5; ctx.beginPath(); ctx.moveTo(-14, -9); ctx.lineTo(-4, -9); ctx.moveTo(-14, 9); ctx.lineTo(-4, 9); ctx.stroke();
    }
    ctx.restore();
  }
}
