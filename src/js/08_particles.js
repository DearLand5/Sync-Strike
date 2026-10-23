/* =====================================================================
   ParticleSystem — пул частиц фиксированного размера (без мусора в GC),
   плюс камера с тряской и толчками.
   ===================================================================== */
class ParticleSystem {
  constructor(max = 700) {
    this.pool = [];
    for (let i = 0; i < max; i++) this.pool.push({ on: false });
    this.cursor = 0;
    this.count = 0;
    this.cap = max;
    this.mult = 1;
  }
  setQuality(q) { this.cap = q === "low" ? 220 : this.pool.length; this.mult = q === "low" ? 0.45 : 1; }
  clear() { for (const p of this.pool) p.on = false; this.count = 0; }

  spawn(type, x, y, o = {}) {
    if (this.count >= this.cap) return null;
    const pool = this.pool, n = pool.length;
    for (let k = 0; k < n; k++) {
      const p = pool[this.cursor];
      this.cursor = (this.cursor + 1) % n;
      if (!p.on) {
        p.on = true; this.count++;
        p.type = type; p.x = x; p.y = y;
        p.vx = o.vx || 0; p.vy = o.vy || 0;
        p.life = p.max = o.life || 0.5;
        p.size = o.size || 2; p.size2 = o.size2 || p.size;
        p.color = o.color || "#ffffff";
        p.drag = o.drag == null ? 2 : o.drag;
        p.grav = o.grav || 0;
        p.rot = o.rot || 0; p.vr = o.vr || 0;
        p.add = !!o.add;
        p.a0 = o.a0 || 0; p.a1 = o.a1 || 0;
        p.text = o.text || ""; p.alpha = o.alpha == null ? 1 : o.alpha;
        p.screen = !!o.screen;
        return p;
      }
    }
    return null;
  }

  /* ---- готовые эффекты ---- */
  sparks(x, y, n, color, speed = 260, dir = null, spread = Math.PI, life = 0.35) {
    n = Math.max(1, Math.round(n * this.mult));
    for (let i = 0; i < n; i++) {
      const a = dir == null ? rand(0, TAU) : dir + rand(-spread, spread) / 2;
      const sp = speed * rand(0.35, 1);
      this.spawn("spark", x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: life * rand(0.6, 1.2), size: rand(1, 2), color, drag: 5, grav: 300, add: true });
    }
  }
  ring(x, y, r0, r1, color, life = 0.35, width = 2) { this.spawn("ring", x, y, { size: r0, size2: r1, color, life, add: true, a0: width }); }
  smoke(x, y, n, color = "#20222a", life = 0.7) {
    n = Math.max(1, Math.round(n * this.mult));
    for (let i = 0; i < n; i++) this.spawn("smoke", x + rand(-4, 4), y + rand(-4, 4), { vx: rand(-30, 30), vy: rand(-40, -5), life: life * rand(0.7, 1.3), size: rand(3, 6), size2: rand(10, 18), color, drag: 2 });
  }
  shards(x, y, n, color, speed = 200) {
    n = Math.max(1, Math.round(n * this.mult));
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = speed * rand(0.3, 1);
      this.spawn("shard", x + rand(-6, 6), y + rand(-14, 4), { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, life: rand(0.5, 1.0), size: rand(1.5, 3.5), color, drag: 2.5, grav: 380, vr: rand(-12, 12), add: i % 2 === 0 });
    }
  }
  slashArc(x, y, r, a0, a1, color, width = 6, life = 0.18) { this.spawn("arc", x, y, { size: width, size2: r, a0, a1, color, life, add: true }); }
  text(x, y, str, color, size = 14, life = 0.8) { this.spawn("text", x, y, { vy: -40, drag: 3, text: str, color, size, life }); }
  dust(x, y, n, color = "#3a3c48") {
    n = Math.max(1, Math.round(n * this.mult));
    for (let i = 0; i < n; i++) this.spawn("smoke", x + rand(-8, 8), y - 1, { vx: rand(-60, 60), vy: rand(-30, -5), life: rand(0.3, 0.6), size: rand(1.5, 3), size2: rand(4, 8), color, drag: 4 });
  }
  line(x, y, x2, y2, color, width = 3, life = 0.2) { this.spawn("line", x, y, { a0: x2, a1: y2, color, size: width, life, add: true, drag: 0 }); }
  shockwave(x, y, color, reach = 140) { this.spawn("wave", x, y, { size: 4, size2: reach, color, life: 0.45, add: true }); }

  update(dt) {
    for (const p of this.pool) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; this.count--; continue; }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy = p.vy * d + p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  draw(ctx, additivePass) {
    for (const p of this.pool) {
      if (!p.on || p.add !== additivePass) continue;
      const k = p.life / p.max;
      ctx.globalAlpha = p.alpha * Math.min(1, k * 1.6);
      switch (p.type) {
        case "spark":
          ctx.strokeStyle = p.color; ctx.lineWidth = p.size;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); ctx.stroke();
          break;
        case "dot":
          ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * k, 0, TAU); ctx.fill();
          break;
        case "smoke":
          ctx.globalAlpha = p.alpha * 0.35 * k;
          ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, lerp(p.size2, p.size, k), 0, TAU); ctx.fill();
          break;
        case "ring":
          ctx.strokeStyle = p.color; ctx.lineWidth = p.a0 * k;
          ctx.beginPath(); ctx.arc(p.x, p.y, lerp(p.size2, p.size, easeOut(k)), 0, TAU); ctx.stroke();
          break;
        case "shard":
          ctx.fillStyle = p.color;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.beginPath(); ctx.moveTo(-p.size, -p.size * 0.5); ctx.lineTo(p.size, 0); ctx.lineTo(-p.size * 0.6, p.size * 0.7); ctx.closePath(); ctx.fill();
          ctx.restore();
          break;
        case "arc": {
          const span = p.a1 - p.a0;
          ctx.strokeStyle = p.color; ctx.lineWidth = p.size * k;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size2, p.a0 + span * (1 - k) * 0.35, p.a1); ctx.stroke();
          break;
        }
        case "line":
          ctx.strokeStyle = p.color; ctx.lineWidth = p.size * k; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.a0, p.a1); ctx.stroke();
          break;
        case "wave": {
          const r = lerp(p.size2, p.size, k);
          ctx.strokeStyle = p.color; ctx.lineWidth = 3 * k;
          ctx.beginPath(); ctx.moveTo(p.x - r, p.y); ctx.lineTo(p.x - r * 0.6, p.y); ctx.moveTo(p.x + r * 0.6, p.y); ctx.lineTo(p.x + r, p.y); ctx.stroke();
          ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.12, 0, Math.PI, TAU); ctx.stroke();
          break;
        }
        case "text":
          ctx.fillStyle = p.color;
          ctx.font = `600 ${p.size}px "Oswald", "Arial Narrow", sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(p.text, p.x, p.y);
          break;
      }
    }
    ctx.globalAlpha = 1;
  }
}

/* ---------- Камера ---------- */
class Camera {
  constructor() {
    this.x = 0; this.y = -108; this.zoom = 1; this.bump = 0; this.trauma = 0; this.t = 0; this.ox = 0; this.oy = 0; this.rot = 0;
    this.fx = 0; this.fy = 0; this.fz = 1; this.fw = 0; this.fTarget = 0; this.tilt = 0;
  }
  shake(a) { this.trauma = Math.min(1, this.trauma + a); }
  kick(a) { this.bump = Math.min(0.06, this.bump + a); }
  /** Кинематографичный фокус: камера наезжает на точку с приближением. */
  focus(x, y, zoom) { this.fx = x; this.fy = y; this.fz = zoom; this.fTarget = 1; this.tilt = (Math.random() < 0.5 ? -1 : 1) * 0.035; }
  release() { this.fTarget = 0; }
  update(dt, tx, ty, worldW, viewW, shakeAmount) {
    this.t += dt;
    this.fw = damp(this.fw, this.fTarget, this.fTarget ? 9 : 4, dt);
    const fz = 1 + (this.fz - 1) * this.fw;
    const vw = viewW / fz;
    const half = vw / 2;
    const wantX = lerp(tx, this.fx, this.fw), wantY = lerp(ty, this.fy, this.fw);
    const cx = worldW > vw ? clamp(wantX, half, worldW - half) : worldW / 2;
    this.x = damp(this.x, cx, this.fTarget ? 10 : 6, dt);
    this.y = damp(this.y, wantY, this.fTarget ? 10 : 4, dt);
    this.bump = damp(this.bump, 0, 7, dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma * shakeAmount;
    const t = this.t * 40;
    this.ox = sh * 9 * (Math.sin(t * 1.3) + Math.sin(t * 2.7) * 0.5);
    this.oy = sh * 7 * (Math.sin(t * 1.7 + 1) + Math.sin(t * 3.1) * 0.5);
    this.rot = sh * 0.012 * Math.sin(t * 0.9) + this.tilt * this.fw;
    this.zoom = fz + this.bump;
  }
}
