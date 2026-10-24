/* =====================================================================
   Арены, набор Б: «Глубинная станция», «Бамбуковая роща», «Орбита», «Северное сияние».
   Добавляются в THEMES (09_arena); список id собирает 09z_themes.js.
   Правила те же, что в 09_arena: всё подвесное крепится к опоре в том же слое параллакса
   (paint — статика один раз в тайл, dyn — анимация по якорям A). Парящее — только стилевое
   (медузы, светлячки, пузырьки, снег). Помощники лежат в блоке {…} и не пересекаются с другими модулями.
   ===================================================================== */
{
  /** Скруглённый прямоугольник. */
  const rrect = (c, x, y, w, h, r) => {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  };
  /** Мягкое свечение (радиальный градиент). */
  const glowAt = (c, x, y, r, col, a) => {
    if (a <= 0.01) return;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  };
  /** Ель-силуэт: ярусы-треугольники, ствол стоит на земле by. */
  const fir = (c, x, by, fh, fw, tiers, snow) => {
    c.fillRect(x - 1.5, by - fh * 0.12, 3, fh * 0.12);
    for (let i = 0; i < tiers; i++) {
      const t0 = i / tiers, yb = by - fh * (0.1 + 0.9 * t0 * 0.92), yt = by - fh * (0.1 + 0.9 * (t0 + 1.25 / tiers)), hw = fw * (1 - t0 * 0.85) / 2;
      c.beginPath(); c.moveTo(x - hw, yb); c.lineTo(x, Math.max(yt, by - fh)); c.lineTo(x + hw, yb); c.closePath(); c.fill();
    }
    if (snow) {   // снег на ярусах — тонкий светлый контур с одной стороны
      const f = c.fillStyle; c.strokeStyle = snow; c.lineWidth = 1; c.beginPath();
      for (let i = 0; i < tiers; i++) {
        const t0 = i / tiers, yb = by - fh * (0.1 + 0.9 * t0 * 0.92), yt = by - fh * (0.1 + 0.9 * (t0 + 1.25 / tiers)), hw = fw * (1 - t0 * 0.85) / 2;
        c.moveTo(x - hw * 0.9, yb - 0.5); c.lineTo(x, Math.max(yt, by - fh) + 0.5);
      }
      c.stroke(); c.fillStyle = f;
    }
  };
  /** Ломаный гребень с повторяющимся краем (бесшовный); возвращает высоты узлов. */
  const ridge = (c, w, h, rng, color, amp, base, rim, pts) => {
    const ys = []; for (let i = 0; i < pts; i++) ys.push(h - base - rng() * amp);
    ys.push(ys[0]);
    c.fillStyle = color; c.beginPath(); c.moveTo(0, h);
    for (let i = 0; i <= pts; i++) c.lineTo(i / pts * w, ys[i]);
    c.lineTo(w + TILE_PAD, h); c.closePath(); c.fill();
    if (rim) { c.strokeStyle = rim; c.lineWidth = 1.2; c.beginPath(); for (let i = 0; i <= pts; i++) c.lineTo(i / pts * w, ys[i] + 0.6); c.stroke(); }
    return ys;
  };
  /** Приглушённость сцены в спокойных частях / «горячесть» в дропе: [hot, calm]. */
  const moods = R => { const k = R.arena.kw; return [k.drop + k.climax, k.calm + k.intro + k.outro + k.break]; };

  THEMES.push(
    /* ===================== 1. ГЛУБИННАЯ СТАНЦИЯ ===================== */
    {
      id: "deepstation", name: "Глубинная станция", desc: "глубокий бас, тёмная электроника и эмбиент",
      pal: { sky: ["#01070d", "#06202c"], glow: "#27e8d4", neonA: "#27e8d4", neonB: "#ffb13b", floor: "#030a0e", edge: "#27e8d4", fog: "#0a3340" },
      profile: { low: [0.5, 0.14], bpm: [105, 30], loudness: [0.5, 0.3], density: [2.4, 2], high: [0.12, 0.1] },
      fogA: 0.34,
      layers: [
        // далёкие купола и башни станции: холодный синий, тусклые иллюминаторы
        { top: 0.8, f: 0.09, haze: 0.5, paint(c, w, h, rng) {
          for (const b of layoutRow(w, rng, 44, 96, 20, 90)) {
            const dome = rng() < 0.5, bh = lerp(h * 0.22, h * 0.55, rng());
            c.fillStyle = "#0a2530";
            if (dome) {
              const r = b.w / 2, b0 = bh * 0.4;
              c.beginPath(); c.arc(b.x + r, h - b0, r, Math.PI, 0); c.lineTo(b.x + b.w, h); c.lineTo(b.x, h); c.closePath(); c.fill();
              c.fillStyle = "rgba(39,232,212,.16)";
              for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(b.x + r + (i - 1) * r * 0.5, h - b0 - r * 0.25 + Math.abs(i - 1) * 4, 2, 0, TAU); c.fill(); }
            } else {
              const tw = b.w * 0.45, tx = b.x + (b.w - tw) / 2;
              c.fillRect(tx, h - bh, tw, bh); c.fillRect(tx - 4, h - bh, tw + 8, 5); c.fillRect(tx + tw / 2 - 1, h - bh - 18, 2, 18);
              c.fillStyle = "rgba(39,232,212,.18)"; for (let y = h - bh + 12; y < h - 14; y += 12) c.fillRect(tx + 3, y, tw - 6, 2);
            }
          }
        } },
        // модули на ногах, соединённые сквозной трубой; иллюминаторы мигают в такт (dyn)
        { top: 0.62, f: 0.26, haze: 0.2, refl: 0.1, paint(c, w, h, rng, A) {
          A.ports = [];
          const yc = h - h * 0.3, row = layoutRow(w, rng, 90, 170, 30, 100);
          c.fillStyle = "#06151d"; c.fillRect(0, yc - 3, w + TILE_PAD, 6);
          for (const b of row) {
            const mh = lerp(28, 40, rng());
            c.fillStyle = "#06151d";
            c.fillRect(b.x + 12, yc, 5, h - yc); c.fillRect(b.x + b.w - 17, yc, 5, h - yc);          // ноги стоят на дне
            c.fillRect(b.x + 6, h - 4, 17, 4); c.fillRect(b.x + b.w - 23, h - 4, 17, 4);
            rrect(c, b.x, yc - mh / 2, b.w, mh, mh / 2); c.fill();
            c.fillStyle = "#0b2430"; c.fillRect(b.x + mh / 2, yc - mh / 2, b.w - mh, 2);               // блик на корпусе
            if (rng() < 0.55) { const ax = b.x + b.w * (0.3 + 0.4 * rng()); c.fillStyle = "#06151d"; c.fillRect(ax, yc - mh / 2 - 22, 2, 22); c.fillRect(ax - 4, yc - mh / 2 - 22, 10, 2); }
            const n = Math.max(2, Math.floor((b.w - mh) / 22));
            for (let i = 0; i < n; i++) A.ports.push({ x: b.x + mh / 2 + (i + 0.5) * (b.w - mh) / n, y: yc, r: 4.2 });
          }
          c.fillStyle = "#020a0f"; for (const p of A.ports) { c.beginPath(); c.arc(p.x, p.y, p.r + 1.4, 0, TAU); c.fill(); }
        }, dyn(c, v, m, pal, R, off, A) {
          const [hot] = moods(R), nA = R.arena.neon(0), nB = R.arena.neon(1);
          for (let i = 0; i < A.ports.length; i++) {
            const p = A.ports[i], lit = (m.beat + i) % 4 === 0 ? 1 : 0.3, col = hot > 0.4 && i % 2 ? nB : nA;
            const a = clamp((0.25 + 0.75 * lit * (0.55 + 0.45 * m.pulse)) * m.I, 0, 1);
            v.repeat(off, p.x, x => {
              const y = layerY(v, p.y);
              c.fillStyle = rgba(col, a * 0.18); c.fillRect(x - 8, y - 8, 16, 16);
              c.fillStyle = rgba(col, 0.2 + 0.7 * a); c.beginPath(); c.arc(x, y, p.r, 0, TAU); c.fill();
            });
          }
        } },
        // ближняя ферма: колонны, балка с трубами, подвесные лампы на тросах от балки
        { top: 0.86, f: 0.44, paint(c, w, h, rng, A) {
          A.lamps = [];
          const by = h * 0.2, bh = 14, N = Math.max(3, Math.round(w / 260)), cw = w / N, np = Math.round(w / 34);
          c.fillStyle = "#030c12"; c.strokeStyle = "#030c12";
          c.fillRect(0, by, w + TILE_PAD, 5); c.fillRect(0, by + bh, w + TILE_PAD, 4);
          c.lineWidth = 2; c.beginPath();
          for (let i = 0; i < np; i++) { c.moveTo(i * w / np, by + 4); c.lineTo((i + 0.5) * w / np, by + bh); c.lineTo((i + 1) * w / np, by + 4); }
          c.stroke();
          c.fillRect(0, by - 7, w + TILE_PAD, 4);       // труба над балкой
          for (let i = 0; i < N; i++) {
            const x = (i + 0.25) * cw;
            c.fillStyle = "#030c12"; c.fillRect(x - 6, by, 12, h - by); c.fillRect(x - 10, h - 5, 20, 5); c.fillRect(x - 9, by - 2, 18, 8);
            c.fillStyle = "#0a2430"; c.fillRect(x - 6, by + 8, 1.5, h - by - 14);
            c.fillStyle = "#030c12"; for (let y = by + 40; y < h - 20; y += 44) c.fillRect(x - 8, y, 16, 3);
            const lx = (i + 0.75) * cw, len = lerp(14, 26, rng()), ly = by + bh + 4 + len;
            c.fillRect(lx - 0.5, by + bh + 2, 1, len); c.fillRect(lx - 5, ly - 1, 10, 4);
            A.lamps.push({ x: lx, y: ly + 3 });
          }
        }, dyn(c, v, m, pal, R, off, A) {
          const [hot] = moods(R), nA = R.arena.neon(0), nB = R.arena.neon(1);
          const strobe = hot > 0.3 ? m.strong : 0, col = strobe > 0.4 ? nB : nA;
          const la = (0.5 + 0.35 * m.pulse + 0.4 * strobe) * (0.6 + 0.4 * m.I);
          c.save(); c.globalCompositeOperation = "lighter";
          for (const L of A.lamps) v.repeat(off, L.x, x => {
            const y = layerY(v, L.y);
            c.fillStyle = rgba(col, 0.07 * la);
            c.beginPath(); c.moveTo(x - 4, y); c.lineTo(x + 4, y); c.lineTo(x + 38, v.floorY); c.lineTo(x - 38, v.floorY); c.closePath(); c.fill();
            glowAt(c, x, y, 22, col, 0.35 * la);
            c.fillStyle = rgba("#ffffff", 0.55 * la); c.fillRect(x - 3, y - 1, 6, 2);
          });
          c.restore();
        } },
      ],
      build(rng) {
        this.bubbles = []; for (let i = 0; i < 36; i++) this.bubbles.push({ x: rng(), ph: rng(), sp: lerp(0.05, 0.14, rng()), r: lerp(1.2, 3.4, rng()), w: rng() * TAU });
        this.jelly = []; for (let i = 0; i < 5; i++) this.jelly.push({ x: rng(), y: lerp(0.12, 0.5, rng()), s: lerp(9, 17, rng()), ph: rng() * TAU, c: i % 2 });
      },
      back(c, v, m, pal, R) {
        const [hot, calm] = moods(R), t = m.time;
        // косые лучи света с поверхности: ярче в спокойных частях
        c.save(); c.globalCompositeOperation = "lighter";
        const g = c.createLinearGradient(0, 0, 0, v.floorY);
        g.addColorStop(0, rgba("#9ffff0", 0.5)); g.addColorStop(1, rgba("#9ffff0", 0));
        c.fillStyle = g;
        for (let i = 0; i < 5; i++) {
          const x0 = ((i + 0.3) * v.w / 5 - v.camX * v.scale * 0.04 + Math.sin(t * 0.18 + i * 1.7) * 30 + v.w) % (v.w * 1.2) - v.w * 0.1;
          c.globalAlpha = (0.05 + 0.04 * Math.sin(t * 0.4 + i * 2.1) + 0.04 * m.mid + 0.03 * calm) * (hot > 0.4 ? 0.7 : 1);
          c.beginPath(); c.moveTo(x0, 0); c.lineTo(x0 + 22, 0); c.lineTo(x0 + 22 + v.floorY * 0.42, v.floorY); c.lineTo(x0 - 18 + v.floorY * 0.42, v.floorY); c.closePath(); c.fill();
        }
        c.globalAlpha = 1;
        // медузы-огни (стилевые, плавают): купол, шлейф щупалец; пульс на доле
        for (const q of this.jelly) {
          const x = ((q.x * v.w * 1.4 - v.camX * v.scale * 0.12 + Math.sin(t * 0.3 + q.ph) * 24) % (v.w * 1.4) + v.w * 1.4) % (v.w * 1.4) - v.w * 0.2;
          const y = q.y * v.floorY + Math.sin(t * 0.5 + q.ph) * 10 - R.arena.buildW * 14;
          const s = q.s * (1 + 0.14 * m.pulse), col = q.c ? R.arena.neon(1) : R.arena.neon(0), a = 0.4 + 0.4 * m.I;
          glowAt(c, x, y, s * 2.6, col, 0.16 * a);
          c.fillStyle = rgba(col, 0.55 * a); c.beginPath(); c.ellipse(x, y, s, s * 0.7, 0, Math.PI, 0); c.closePath(); c.fill();
          c.strokeStyle = rgba(col, 0.4 * a); c.lineWidth = 1; c.beginPath();
          for (let k = -2; k <= 2; k++) { const tx = x + k * s * 0.35; c.moveTo(tx, y); c.quadraticCurveTo(tx + Math.sin(t * 1.4 + k + q.ph) * 5, y + s * 1.2, tx + Math.sin(t * 1.1 + k) * 7, y + s * 2.2); }
          c.stroke();
        }
        c.restore();
      },
      front(c, v, m, pal, R) {
        // пузырьки поднимаются со дна; при нарастании — быстрее
        const bw = R.arena.buildW, n = Math.round(this.bubbles.length * (0.5 + 0.5 * R.amount)), sp = 1 + 2.2 * bw + 0.6 * m.low;
        c.strokeStyle = rgba("#bff8ff", 0.28 + 0.2 * m.high); c.lineWidth = 1; c.beginPath();
        for (let i = 0; i < n; i++) {
          const b = this.bubbles[i], k = (m.time * b.sp * sp + b.ph) % 1;
          const x = ((b.x * v.w * 1.3 - v.camX * v.scale * 0.45) % (v.w * 1.3) + v.w * 1.3) % (v.w * 1.3) - v.w * 0.15 + Math.sin(m.time * 1.3 + b.w) * 6;
          const y = v.floorY + 6 - k * (v.floorY + 14);
          c.moveTo(x + b.r, y); c.arc(x, y, b.r, 0, TAU);
        }
        c.stroke();
      },
    },

    /* ===================== 2. БАМБУКОВАЯ РОЩА ===================== */
    {
      id: "bamboo", name: "Бамбуковая роща", desc: "акустика, мелодичная музыка, средний темп",
      pal: { sky: ["#050b0c", "#0f2a22"], glow: "#7dffb0", neonA: "#7dffb0", neonB: "#ffcf7a", floor: "#060c0a", edge: "#7dffb0", fog: "#143a2e" },
      profile: { bpm: [92, 26], mid: [0.55, 0.12], perc: [0.35, 0.2], loudness: [0.42, 0.26], dynamics: [0.5, 0.3], density: [1.8, 1.5] },
      fogA: 0.32,
      layers: [
        // далёкий лес: тонкие бледные стебли
        { f: 0.1, haze: 0.55, paint(c, w, h, rng) {
          for (const b of layoutRow(w, rng, 3, 6, 10, 26)) {
            c.fillStyle = "#0e2b25"; c.fillRect(b.x, -20, b.w, h + 20);
            c.fillStyle = "#133831"; for (let y = rng() * 40; y < h; y += lerp(34, 50, rng())) c.fillRect(b.x - 0.5, y, b.w + 1, 1.5);
          }
        } },
        // средний план: стебли с кисточками листьев, каменные фонари на земле, светлячки
        { f: 0.25, haze: 0.22, refl: 0.08, paint(c, w, h, rng, A) {
          A.lanterns = []; A.flies = [];
          for (const b of layoutRow(w, rng, 6, 10, 26, 80)) {
            c.fillStyle = "#07170f"; c.fillRect(b.x, -20, b.w, h + 20);
            c.fillStyle = "rgba(125,255,176,.16)"; c.fillRect(b.x, -20, 1, h + 20);        // лунный контровой свет
            c.fillStyle = "#0b2218";
            for (let y = rng() * 30; y < h; y += lerp(36, 56, rng())) {
              c.fillRect(b.x - 1, y, b.w + 2, 2);
              if (rng() < 0.35) {      // побег с листьями от узла
                const dir = rng() < 0.5 ? -1 : 1, bx = b.x + b.w / 2, len = lerp(14, 26, rng());
                c.strokeStyle = "#07170f"; c.lineWidth = 1; c.beginPath(); c.moveTo(bx, y); c.lineTo(bx + dir * len, y - 6); c.stroke();
                c.fillStyle = "#07170f";
                for (let k = 0; k < 3; k++) { const lx = bx + dir * (len - k * 5), ly = y - 6 + k * 2; c.beginPath(); c.moveTo(lx, ly); c.quadraticCurveTo(lx + dir * 7, ly + 1 - k, lx + dir * 14, ly + 7 + k * 2); c.quadraticCurveTo(lx + dir * 6, ly + 5, lx, ly); c.fill(); }
                c.fillStyle = "#0b2218";
              }
            }
          }
          // каменные фонари (торо) стоят на земле: основание, ножка, площадка, огневая камера, крыша
          const NL = Math.max(2, Math.round(w / 330));
          for (let i = 0; i < NL; i++) {
            const x = (i + 0.5) * w / NL + (rng() - 0.5) * 60, s = lerp(1, 1.3, rng());
            c.fillStyle = "#061310";
            c.fillRect(x - 8 * s, h - 3, 16 * s, 3); c.fillRect(x - 2.5 * s, h - 20 * s, 5 * s, 17 * s);
            c.fillRect(x - 8 * s, h - 22 * s, 16 * s, 3 * s); c.fillRect(x - 6 * s, h - 34 * s, 12 * s, 12 * s);
            c.beginPath(); c.moveTo(x - 11 * s, h - 34 * s); c.lineTo(x, h - 41 * s); c.lineTo(x + 11 * s, h - 34 * s); c.closePath(); c.fill();
            c.fillRect(x - 1.5, h - 45 * s, 3, 5 * s);
            A.lanterns.push({ x, y: h - 28 * s, s });
          }
          for (let i = 0; i < Math.round(w / 45); i++) A.flies.push({ x: rng() * w, y: h * lerp(0.35, 0.95, rng()), ph: rng() * TAU, r: lerp(10, 30, rng()) });
        }, dyn(c, v, m, pal, R, off, A) {
          const [hot, calm] = moods(R), nA = R.arena.neon(0), nB = R.arena.neon(1), t = m.time, bw = R.arena.buildW;
          // окошки фонарей: тёплый свет, вспышка на долях
          c.save(); c.globalCompositeOperation = "lighter";
          const la = (0.55 + 0.3 * m.pulse + 0.25 * m.strong * hot) * (0.6 + 0.4 * m.I);
          for (const L of A.lanterns) v.repeat(off, L.x, x => {
            const y = layerY(v, L.y);
            glowAt(c, x, y, 40 * L.s, nB, 0.45 * la);
            c.fillStyle = rgba("#ffe2a8", 0.85 * la); c.fillRect(x - 3 * L.s, y - 4 * L.s, 6 * L.s, 7 * L.s);
          });
          // светлячки (стилевые, парят): мигают, на нарастании поднимаются, на дропе меняют цвет
          const n = Math.round(A.flies.length * (0.6 + 0.4 * R.amount)), col = hot > 0.4 ? nA : nB;
          for (let i = 0; i < n; i++) {
            const F = A.flies[i], bl = Math.pow(0.5 + 0.5 * Math.sin(t * (0.9 + (i % 5) * 0.2) + F.ph), 2);
            const a = (0.25 + 0.75 * bl) * (1 - 0.5 * calm) * (0.7 + 0.5 * m.pulse * (i % 3 === 0 ? 1 : 0));
            v.repeat(off, F.x, x => {
              const fx = x + Math.sin(t * 0.4 + F.ph) * F.r, fy = layerY(v, F.y) + Math.cos(t * 0.33 + F.ph * 2) * F.r * 0.5 - bw * 26;
              c.fillStyle = rgba(col, 0.1 * a); c.fillRect(fx - 4, fy - 4, 8, 8);
              c.fillStyle = rgba(col, 0.9 * a); c.fillRect(fx - 1, fy - 1, 2, 2);
            });
          }
          c.restore();
        } },
        // ближний план: толстые стебли и два деревянных столба с бумажными фонарями на кронштейнах
        { f: 0.44, paint(c, w, h, rng, A) {
          A.hang = [];
          for (const b of layoutRow(w, rng, 12, 18, 90, 210)) {
            c.fillStyle = "#030b07"; c.fillRect(b.x, -20, b.w, h + 20);
            c.fillStyle = "rgba(125,255,176,.12)"; c.fillRect(b.x, -20, 1.5, h + 20);
            c.fillStyle = "#08180f"; for (let y = rng() * 40; y < h; y += lerp(48, 70, rng())) c.fillRect(b.x - 1.5, y, b.w + 3, 3);
          }
          const NP = Math.max(2, Math.round(w / 450));
          for (let i = 0; i < NP; i++) {
            const x = (i + 0.5) * w / NP + (rng() - 0.5) * 50, ph = h * lerp(0.42, 0.52, rng()), dir = i % 2 ? -1 : 1;
            c.fillStyle = "#0a0805";
            c.fillRect(x - 3, h - ph, 6, ph); c.fillRect(x - 8, h - 6, 16, 6);                       // столб на земле
            c.fillRect(x - 6, h - ph - 3, 12, 4);                                                    // капитель
            c.fillRect(x, h - ph + 8, dir * 30, 3); c.beginPath(); c.moveTo(x, h - ph + 26); c.lineTo(x + dir * 24, h - ph + 11); c.lineTo(x + dir * 24, h - ph + 8); c.lineTo(x, h - ph + 20); c.fill();  // кронштейн с подкосом
            A.hang.push({ x: x + dir * 28, y: h - ph + 11 });
          }
        }, dyn(c, v, m, pal, R, off, A) {
          const [hot] = moods(R), nB = R.arena.neon(1), t = m.time;
          for (let i = 0; i < A.hang.length; i++) {
            const H = A.hang[i], sw = Math.sin(t * 0.9 + i * 1.9) * 0.06 + 0.04 * m.pulse * (i % 2 ? 1 : -1);
            v.repeat(off, H.x, x => {
              const y = layerY(v, H.y), L = 12, bx = x + Math.sin(sw) * L, by = y + Math.cos(sw) * L;
              c.strokeStyle = "#0a0805"; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y); c.lineTo(bx, by); c.stroke();
              c.fillStyle = "#0a0805"; c.fillRect(bx - 4, by - 1, 8, 2);
              c.fillStyle = rgba("#ff9a4a", 0.7 + 0.25 * m.pulse + 0.15 * hot); c.beginPath(); c.ellipse(bx, by + 8, 6, 8.5, 0, 0, TAU); c.fill();   // бумажный фонарь
              c.fillStyle = "#0a0805"; c.fillRect(bx - 3, by + 15, 6, 2);
              c.save(); c.globalCompositeOperation = "lighter"; glowAt(c, bx, by + 8, 36, nB, (0.22 + 0.2 * m.pulse + 0.15 * hot) * (0.6 + 0.4 * m.I)); c.restore();
            });
          }
        } },
      ],
      back(c, v, m, pal, R) {
        // луна за стеблями и слои тумана над землёй
        const mx = v.w * 0.7 - v.camX * v.scale * 0.02, my = v.floorY * 0.3, r = Math.min(v.w, v.h) * 0.12;
        glowAt(c, mx, my, r * 3.2, "#bfffe0", 0.12 + 0.06 * m.low);
        c.fillStyle = rgba("#d8f5e6", 0.5 + 0.08 * m.low); c.beginPath(); c.arc(mx, my, r, 0, TAU); c.fill();
        c.fillStyle = "rgba(10,40,30,.14)"; c.beginPath(); c.arc(mx - r * 0.3, my - r * 0.2, r * 0.22, 0, TAU); c.arc(mx + r * 0.3, my + r * 0.25, r * 0.15, 0, TAU); c.fill();
      },
      front(c, v, m, pal, R) {
        // стелющийся туман; падающие листья на дропе и кульминации
        for (let i = 0; i < 3; i++) {
          const x = ((m.time * (8 + i * 5) + i * 420 - v.camX * v.scale * (0.5 + i * 0.2)) % (v.w + 600)) - 300, y = v.floorY - 14 + i * 16;
          glowAt(c, x, y, 250, "#8fd8b8", 0.05 + 0.06 * m.I);
        }
        const [hot] = moods(R);
        if (hot > 0.3 && rand() < 0.12 * hot * R.amount) R.amb.push({ x: rand(0, v.w), y: -6, vx: rand(-20, 10), vy: rand(30, 60), life: 7, c: "#7dffb0", petal: true });
      },
    },

    /* ===================== 3. ОРБИТА ===================== */
    {
      id: "orbit", name: "Орбита", desc: "космическая электроника, синтезаторы, чистые верха",
      pal: { sky: ["#02030a", "#0a0d26"], glow: "#6aa8ff", neonA: "#5fd0ff", neonB: "#ff7ad9", floor: "#05060d", edge: "#5fd0ff", fog: "#101838" },
      profile: { bpm: [122, 24], high: [0.26, 0.1], bright: [0.5, 0.25], dynamics: [0.5, 0.3], density: [3, 2], loudness: [0.55, 0.28] },
      fogA: 0.22,
      layers: [
        // далёкая станция: ряд модулей, радиаторы и тонкие решётки (низко, чтобы планета оставалась видна)
        { top: 0.58, f: 0.08, haze: 0.5, paint(c, w, h, rng) {
          for (const b of layoutRow(w, rng, 40, 100, 14, 60)) {
            const bh = lerp(h * 0.16, h * 0.44, rng()), k = rng();
            c.fillStyle = "#080e26";
            c.fillRect(b.x, h - bh, b.w, bh);
            if (k < 0.4) {       // радиатор: рёбра
              for (let x = b.x + 3; x < b.x + b.w - 3; x += 5) c.fillRect(x, h - bh - 14, 2, 14);
            } else if (k < 0.7) { c.fillRect(b.x + b.w / 2 - 1, h - bh - 20, 2, 20); c.fillRect(b.x + b.w / 2 - 6, h - bh - 14, 12, 1.5); }
            c.fillStyle = "rgba(95,208,255,.2)"; c.fillRect(b.x, h - bh, b.w, 1.2);
          }
        } },
        // солнечные батареи на мачтах (сетка, блик), двигательные блоки с соплами (dyn — факел)
        { top: 0.78, f: 0.23, haze: 0.18, refl: 0.1, paint(c, w, h, rng, A) {
          A.panels = []; A.nozzles = [];
          const row = layoutRow(w, rng, 100, 150, 40, 100);
          for (let i = 0; i < row.length; i++) {
            const b = row[i];
            if (i % 3 === 1) {      // двигательный блок: корпус на палубе, колокол сопла слева
              const bh = lerp(26, 38, rng()), by = h - bh, nw = 16, ny = by + bh * 0.5;
              c.fillStyle = "#101a44"; c.fillRect(b.x + nw, by, b.w - nw, bh); c.fillRect(b.x + nw, by - 5, b.w - nw - 10, 5);
              c.beginPath(); c.moveTo(b.x + nw, ny - 7); c.lineTo(b.x, ny - 13); c.lineTo(b.x, ny + 13); c.lineTo(b.x + nw, ny + 7); c.closePath(); c.fill();
              c.fillStyle = "rgba(95,208,255,.22)"; c.fillRect(b.x + nw, by, b.w - nw, 1.2);
              c.fillStyle = "#050818"; for (let x = b.x + nw + 8; x < b.x + b.w - 8; x += 10) c.fillRect(x, by + 6, 2, bh - 8);
              A.nozzles.push({ x: b.x, y: ny });
            } else {                              // мачта с панелью: стойка от палубы до рамы
              const pw = Math.min(b.w, lerp(56, 90, rng())), ph = lerp(24, 40, rng()), mh = lerp(h * 0.28, h * 0.5, rng()), cx = b.x + b.w / 2, py = h - mh - ph;
              c.fillStyle = "#0a1030"; c.fillRect(cx - 2, py, 4, mh + ph); c.fillRect(cx - 9, h - 4, 18, 4);
              c.fillRect(cx - pw / 2 - 2, py - 2, pw + 4, ph + 4);
              c.fillStyle = "#0e1a48"; c.fillRect(cx - pw / 2, py, pw, ph);
              c.strokeStyle = "#050818"; c.lineWidth = 1; c.beginPath();
              for (let x = cx - pw / 2; x <= cx + pw / 2 + 0.1; x += pw / 6) { c.moveTo(x, py); c.lineTo(x, py + ph); }
              for (let y = py; y <= py + ph + 0.1; y += ph / 3) { c.moveTo(cx - pw / 2, y); c.lineTo(cx + pw / 2, y); }
              c.stroke();
              A.panels.push({ x: cx - pw / 2, y: py, w: pw, hh: ph });
            }
          }
        }, dyn(c, v, m, pal, R, off, A) {
          const [hot] = moods(R), nA = R.arena.neon(0), nB = R.arena.neon(1);
          c.save(); c.globalCompositeOperation = "lighter";
          // блик по панелям: полоса бежит по фазе доли
          for (let i = 0; i < A.panels.length; i++) {
            const P = A.panels[i], k = (m.phase + i * 0.37) % 1;
            v.repeat(off, P.x, x => {
              const y = layerY(v, P.y), gx = x + k * (P.w + 14) - 7;
              c.save(); c.beginPath(); c.rect(x, y, P.w, P.hh); c.clip();
              c.fillStyle = rgba("#bfe8ff", (0.1 + 0.18 * m.pulse) * (0.6 + 0.4 * m.I));
              c.beginPath(); c.moveTo(gx - 4, y + P.hh); c.lineTo(gx + 2, y); c.lineTo(gx + 8, y); c.lineTo(gx + 2, y + P.hh); c.closePath(); c.fill();
              c.restore();
            });
          }
          // факелы двигателей: тлеют всегда, на дропе и кульминации вспыхивают (длина — от силы доли)
          for (let i = 0; i < A.nozzles.length; i++) {
            const N = A.nozzles[i], len = 6 + 14 * m.pulse + hot * (30 + 60 * m.strong + 26 * m.pulse) + R.arena.buildW * 18, fl = 0.85 + 0.15 * Math.sin(m.time * 40 + i);
            v.repeat(off, N.x, x => {
              const y = layerY(v, N.y), L = len * fl;
              const g = c.createLinearGradient(x, 0, x - L, 0);
              g.addColorStop(0, rgba("#ffffff", 0.85)); g.addColorStop(0.25, rgba(nA, 0.65)); g.addColorStop(1, rgba(nB, 0));
              c.fillStyle = g; c.beginPath(); c.moveTo(x, y - 11); c.lineTo(x - L, y - 2 - 2 * hot); c.lineTo(x - L, y + 2 + 2 * hot); c.lineTo(x, y + 11); c.closePath(); c.fill();
              glowAt(c, x - 4, y, 20 + 22 * hot, nA, 0.18 + 0.25 * hot);
            });
          }
          c.restore();
        } },
        // ближний шлюз: колонны, ферма-решётка, антенные тарелки, маячки на колоннах
        { top: 0.88, f: 0.44, paint(c, w, h, rng, A) {
          A.beacons = [];
          const by = h * 0.18, bh = 16, N = Math.max(3, Math.round(w / 300)), cw = w / N, np = Math.round(w / 26);
          c.fillStyle = "#040616"; c.strokeStyle = "#040616";
          c.fillRect(0, by, w + TILE_PAD, 3); c.fillRect(0, by + bh, w + TILE_PAD, 3);
          c.lineWidth = 1.6; c.beginPath();
          for (let i = 0; i < np; i++) { c.moveTo(i * w / np, by + 3); c.lineTo((i + 0.5) * w / np, by + bh); c.lineTo((i + 1) * w / np, by + 3); }
          c.stroke();
          c.fillStyle = "rgba(95,208,255,.3)"; c.fillRect(0, by, w + TILE_PAD, 1);
          for (let i = 0; i < N; i++) {
            const x = (i + 0.3) * cw;
            c.fillStyle = "#040616"; c.fillRect(x - 6, by, 12, h - by); c.fillRect(x - 11, h - 6, 22, 6); c.fillRect(x - 9, by - 3, 18, 8);
            c.fillStyle = "rgba(95,208,255,.2)"; c.fillRect(x - 6, by + 10, 1.2, h - by - 16);
            c.fillStyle = "#040616"; c.fillRect(x - 0.75, by - 16, 1.5, 14);
            A.beacons.push({ x, y: by - 17 });
            if (i % 2 === 0) {   // тарелка на опоре, стоящей на палубе
              const dx = x + cw * 0.5, dh = h * lerp(0.26, 0.34, rng());
              c.fillRect(dx - 1.5, h - dh, 3, dh); c.fillRect(dx - 7, h - 4, 14, 4);
              c.beginPath(); c.ellipse(dx, h - dh, 13, 6, -0.5, 0, Math.PI); c.fill();
              c.fillRect(dx + 5, h - dh - 12, 1.5, 12);
              A.beacons.push({ x: dx + 5.7, y: h - dh - 13 });
            }
          }
        }, dyn(c, v, m, pal, R, off, A) {
          const nA = R.arena.neon(0), nB = R.arena.neon(1);
          for (let i = 0; i < A.beacons.length; i++) {
            const B = A.beacons[i], on = (m.beat + i) % 2 === 0, a = on ? 0.35 + 0.65 * m.pulse : 0.2, col = i % 2 ? nB : nA;
            v.repeat(off, B.x, x => {
              const y = layerY(v, B.y);
              c.fillStyle = rgba(col, 0.14 * a); c.fillRect(x - 5, y - 5, 10, 10);
              c.fillStyle = rgba(col, 0.4 + 0.55 * a); c.fillRect(x - 1.2, y - 1.2, 2.5, 2.5);
            });
          }
        } },
      ],
      build(rng) {
        this.stars = []; for (let i = 0; i < 80; i++) this.stars.push({ x: rng(), y: rng(), s: rng() < 0.2 ? 2 : 1.2, ph: rng() * TAU });
      },
      back(c, v, m, pal, R) {
        const [hot] = moods(R), nA = R.arena.neon(0), t = m.time;
        // звёзды: мерцают от верхов
        for (const s of this.stars) {
          const x = ((s.x * v.w * 1.1 - v.camX * v.scale * 0.015) % (v.w * 1.1) + v.w * 1.1) % (v.w * 1.1);
          c.fillStyle = rgba("#dfe8ff", 0.25 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.5 + s.ph)) * (0.4 + m.high));
          c.fillRect(x, s.y * v.floorY * 0.7, s.s, s.s);
        }
        // планета снизу слева: тёмный диск, полосы облаков, светящаяся кромка атмосферы
        const pr = Math.min(Math.max(v.w * 0.7, v.floorY * 1.6), v.w), px = v.w * 0.3 - v.camX * v.scale * 0.01, py = v.floorY + pr * 0.66;
        const pg = c.createLinearGradient(0, py - pr, 0, py - pr * 0.3);
        pg.addColorStop(0, "#0e2250"); pg.addColorStop(1, "#04081c");
        c.fillStyle = pg; c.beginPath(); c.arc(px, py, pr, 0, TAU); c.fill();
        c.save(); c.beginPath(); c.arc(px, py, pr, 0, TAU); c.clip();
        c.strokeStyle = "rgba(120,170,255,.1)"; c.lineWidth = 7;
        for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(px + 40 + i * 30, py + 30 + i * 20, pr * (0.9 - i * 0.07), Math.PI * 1.15, Math.PI * 1.85); c.stroke(); }
        c.restore();
        c.strokeStyle = rgba(nA, 0.18 + 0.1 * m.low + 0.15 * hot); c.lineWidth = 6; c.beginPath(); c.arc(px, py, pr + 2, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
        c.strokeStyle = rgba("#bfe8ff", 0.45 + 0.2 * m.pulse); c.lineWidth = 1.5; c.beginPath(); c.arc(px, py, pr, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
        // дальний свет звезды справа
        glowAt(c, v.w * 0.88, v.floorY * 0.18, v.floorY * 0.5, "#ffe9c4", 0.06 + 0.05 * m.low + 0.05 * hot);
      },
      floor(c, v, m, pal) {
        // швы обшивки палубы едут с камерой
        const step = 90, ox = -(v.camX * v.scale) % step;
        c.strokeStyle = rgba(pal.edge, 0.08); c.lineWidth = 1; c.beginPath();
        for (let x = ox; x < v.w + step; x += step) { c.moveTo(x, v.floorY + 2); c.lineTo(x - 40, v.h); }
        c.stroke();
      },
      front(c, v, m, pal, R) {
        if (rand() < 0.06 * R.amount) R.amb.push({ x: rand(0, v.w), y: rand(0, v.floorY), vx: rand(-5, 5), vy: rand(-4, 4), life: rand(3, 5), c: "#cfe0ff", mote: true });
      },
    },

    /* ===================== 4. СЕВЕРНОЕ СИЯНИЕ ===================== */
    {
      id: "aurora", name: "Северное сияние", desc: "воздушная, плавная музыка, мягкие нарастания",
      pal: { sky: ["#020712", "#0b2030"], glow: "#4dffb8", neonA: "#4dffb8", neonB: "#b06bff", floor: "#070d14", edge: "#7ff0d8", fog: "#16303c" },
      profile: { bpm: [78, 22], loudness: [0.3, 0.25], dynamics: [0.65, 0.25], energyVar: [0.5, 0.2], high: [0.2, 0.08], density: [1.0, 1.0] },
      fogA: 0.3,
      layers: [
        // дальний хребет со светлой кромкой
        { top: 0.62, f: 0.05, haze: 0.55, paint(c, w, h, rng) { ridge(c, w, h, rng, "#0b1c2a", h * 0.3, h * 0.26, "rgba(127,240,216,.28)", 12); } },
        // средний хребет и редкие ели у его подножия
        { top: 0.5, f: 0.19, haze: 0.3, paint(c, w, h, rng) {
          ridge(c, w, h, rng, "#07131d", h * 0.18, h * 0.1, "rgba(127,240,216,.2)", 16);
          c.fillStyle = "#050d15";
          for (const b of layoutRow(w, rng, 10, 18, 4, 22)) fir(c, b.x + b.w / 2, h, lerp(h * 0.18, h * 0.34, rng()), b.w * 1.2, 5, "rgba(190,240,255,.1)");
        } },
        // ближний план: ели, хижина с дымом и окном, вышка с фонарём на столбе
        { top: 0.78, f: 0.4, paint(c, w, h, rng, A) {
          A.win = []; A.lamps = []; A.smoke = [];
          const ZW = w / 3;       // три зоны: хижина, вышка, лес — стоят на земле и не пересекаются
          for (let z = 0; z < 3; z++) {
            const zx = z * ZW;
            c.fillStyle = "#03080d";
            if (z === 0) {           // хижина: сруб, крыша со снежной шапкой, каменная труба
              const cw = 72, ch = 36, x = zx + ZW * 0.5 - cw / 2, ry = h - ch;
              c.fillRect(x, ry, cw, ch);
              c.beginPath(); c.moveTo(x - 8, ry); c.lineTo(x + cw / 2, ry - 26); c.lineTo(x + cw + 8, ry); c.closePath(); c.fill();
              c.fillRect(x + cw - 20, ry - 30, 8, 22);
              c.fillStyle = "rgba(205,240,255,.35)"; c.beginPath(); c.moveTo(x - 8, ry); c.lineTo(x + cw / 2, ry - 26); c.lineTo(x + cw / 2, ry - 23); c.lineTo(x - 5, ry + 1); c.closePath(); c.fill();
              c.beginPath(); c.moveTo(x + cw + 8, ry); c.lineTo(x + cw / 2, ry - 26); c.lineTo(x + cw / 2, ry - 23); c.lineTo(x + cw + 5, ry + 1); c.closePath(); c.fill();
              c.fillStyle = "rgba(205,240,255,.25)"; c.fillRect(x + cw - 21, ry - 31, 10, 2);
              c.fillStyle = "#010305"; c.fillRect(x + 8, ry + 14, 18, 22);           // дверь
              A.win.push({ x: x + 40, y: ry + 10, w: 20, hh: 14 });
              A.smoke.push({ x: x + cw - 16, y: ry - 31 });
              c.fillStyle = "#03080d"; fir(c, x - 34, h, h * 0.55, 34, 6, "rgba(190,240,255,.12)"); fir(c, x + cw + 30, h, h * 0.42, 28, 6, "rgba(190,240,255,.12)");
            } else if (z === 1) {   // вышка: четыре наклонные опоры, площадка с перилами, мачта с фонарём
              const cx = zx + ZW * 0.5, th = h * 0.5, pw = 26;
              c.strokeStyle = "#03080d"; c.lineWidth = 3; c.beginPath();
              c.moveTo(cx - pw / 2, h); c.lineTo(cx - 6, h - th); c.moveTo(cx + pw / 2, h); c.lineTo(cx + 6, h - th);
              c.moveTo(cx - pw / 2 + 3, h - th * 0.3); c.lineTo(cx + 6, h - th * 0.7); c.moveTo(cx + pw / 2 - 3, h - th * 0.3); c.lineTo(cx - 6, h - th * 0.7);
              c.stroke();
              c.fillRect(cx - 14, h - th - 3, 28, 4);
              c.lineWidth = 1.2; c.beginPath(); c.moveTo(cx - 13, h - th - 3); c.lineTo(cx - 13, h - th - 12); c.moveTo(cx + 13, h - th - 3); c.lineTo(cx + 13, h - th - 12); c.moveTo(cx - 13, h - th - 12); c.lineTo(cx + 13, h - th - 12); c.stroke();
              c.fillRect(cx - 1.5, h - th - 40, 3, 38); c.fillRect(cx - 5, h - th - 42, 10, 3);
              A.lamps.push({ x: cx, y: h - th - 45 });
            } else {                // лес вокруг
              for (const b of layoutRow(ZW, rng, 24, 40, 6, 30)) fir(c, zx + b.x + b.w / 2, h, lerp(h * 0.4, h * 0.7, rng()), b.w * 1.1, 6, "rgba(190,240,255,.12)");
            }
          }
          // столб с фонарём ближе к краю тайла (всё тот же слой)
          const px = ZW * 0.1, ph = h * 0.46;
          c.fillStyle = "#03080d"; c.fillRect(px - 1.5, h - ph, 3, ph); c.fillRect(px - 6, h - 3, 12, 3); c.fillRect(px, h - ph, 18, 2); c.fillRect(px + 14, h - ph, 3, 6);
          A.lamps.push({ x: px + 15.5, y: h - ph + 8, post: true });
        }, dyn(c, v, m, pal, R, off, A) {
          const [hot] = moods(R), t = m.time;
          c.save(); c.globalCompositeOperation = "lighter";
          for (const W of A.win) v.repeat(off, W.x, x => {
            const y = layerY(v, W.y), a = 0.7 + 0.15 * Math.sin(t * 3.1) + 0.15 * m.pulse;
            glowAt(c, x + W.w / 2, y + W.hh / 2, 36, "#ffb13b", 0.2 * a);
            c.fillStyle = rgba("#ffcf7a", 0.85 * a); c.fillRect(x, y, W.w, W.hh);
            c.fillStyle = "#03080d"; c.fillRect(x + W.w / 2 - 0.5, y, 1, W.hh); c.fillRect(x, y + W.hh / 2 - 0.5, W.w, 1);
          });
          for (const L of A.lamps) v.repeat(off, L.x, x => {
            const y = layerY(v, L.y), a = (0.6 + 0.3 * m.pulse + 0.2 * hot * m.strong) * (0.7 + 0.3 * m.I);
            c.fillStyle = rgba("#ffe0a0", 0.06 * a);
            c.beginPath(); c.moveTo(x - 3, y + 2); c.lineTo(x + 3, y + 2); c.lineTo(x + 42, v.floorY); c.lineTo(x - 42, v.floorY); c.closePath(); c.fill();
            glowAt(c, x, y, 28, "#ffcf7a", 0.38 * a);
            c.fillStyle = rgba("#fff2cf", 0.9 * a); c.fillRect(x - 2.5, y - 2.5, 5, 5);
          });
          // дым из трубы: пять клубов поднимаются и расплываются
          for (const S of A.smoke) v.repeat(off, S.x, x => {
            for (let k = 0; k < 5; k++) {
              const u = (t * 0.22 + k / 5) % 1, y = layerY(v, S.y) - u * 46;
              c.fillStyle = rgba("#9db8c8", 0.14 * (1 - u)); c.beginPath(); c.arc(x + u * 12 + Math.sin(t + k) * 2, y, 2.5 + u * 5, 0, TAU); c.fill();
            }
          });
          c.restore();
        } },
      ],
      build(rng) {
        this.stars = []; for (let i = 0; i < 70; i++) this.stars.push({ x: rng(), y: rng(), ph: rng() * TAU });
        this.flakes = []; for (let i = 0; i < 120; i++) this.flakes.push({ x: rng(), y: rng(), s: lerp(0.8, 1.8, rng()), sp: lerp(0.5, 1, rng()), ph: rng() * TAU });
        this.rays = []; for (let i = 0; i < 40; i++) this.rays.push(0.4 + 0.6 * hash1(i * 7 + 3));
      },
      back(c, v, m, pal, R) {
        const [hot, calm] = moods(R), t = m.time, A = R.arena, F = v.floorY;
        for (const s of this.stars) {
          const x = ((s.x * v.w * 1.1 - v.camX * v.scale * 0.01) % (v.w * 1.1) + v.w * 1.1) % (v.w * 1.1);
          c.fillStyle = rgba("#e8f4ff", 0.2 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.2 + s.ph)) * (0.4 + m.high));
          c.fillRect(x, s.y * F * 0.6, 1.4, 1.4);
        }
        // три волны сияния: нижняя кромка яркая, лучи вверх; скорость и размах — от энергии и баса
        c.save(); c.globalCompositeOperation = "lighter";
        const cols = [A.neon(0), A.neon(1), "#4d9bff"], N = 36, amp = 0.55 + 0.45 * m.I, sp = 0.25 + 0.2 * hot + 0.12 * m.mid;
        for (let r = 0; r < 3; r++) {
          const baseY = F * (0.3 + 0.07 * r), hg = F * (0.3 + 0.05 * r) * (0.75 + 0.35 * amp + 0.25 * m.low);
          const ph = t * sp * (r % 2 ? -1 : 1) + r * 2.3, px = v.camX * v.scale * 0.03;
          const ys = [], xs = [];
          for (let i = 0; i <= N; i++) {
            const x = -20 + i / N * (v.w + 40), xw = (x + px) * 0.006;
            xs.push(x); ys.push(baseY + Math.sin(xw * 1.3 + ph) * F * 0.07 * amp + Math.sin(xw * 3.1 - ph * 1.6 + r) * F * 0.025 + hot * Math.sin(xw * 7 + t * 3) * 4);
          }
          const a = (0.95 + 0.3 * m.pulse + 0.25 * m.strong * hot) * (1 - 0.3 * calm) * (r === 2 ? 0.7 : 1);
          const g = c.createLinearGradient(0, baseY - hg - F * 0.1, 0, baseY + F * 0.1);
          g.addColorStop(0, rgba(cols[r], 0)); g.addColorStop(0.72, rgba(cols[r], 0.13 * a)); g.addColorStop(0.92, rgba(cols[r], 0.3 * a)); g.addColorStop(1, rgba(cols[r], 0));
          c.fillStyle = g; c.beginPath(); c.moveTo(xs[0], ys[0] + 6);
          for (let i = 0; i <= N; i++) c.lineTo(xs[i], ys[i] + 6);
          for (let i = N; i >= 0; i--) c.lineTo(xs[i], ys[i] - hg * (0.7 + 0.3 * Math.sin(xs[i] * 0.01 + ph * 1.3 + r * 4)));
          c.closePath(); c.fill();
          c.strokeStyle = rgba(cols[r], 0.14 * a); c.lineWidth = 2; c.beginPath();
          for (let i = 0; i <= N; i++) { const rl = hg * 0.8 * this.rays[i % this.rays.length]; c.moveTo(xs[i], ys[i]); c.lineTo(xs[i] + 4, ys[i] - rl); }
          c.stroke();
          c.strokeStyle = rgba(cols[r], 0.2 * a); c.lineWidth = 1.5; c.beginPath();
          for (let i = 0; i <= N; i++) c.lineTo(xs[i], ys[i]);
          c.stroke();
        }
        c.restore();
      },
      front(c, v, m, pal, R) {
        // снегопад: больше на нарастании, быстрее на дропе; хлопья едут с камерой
        const [hot] = moods(R), n = Math.round(this.flakes.length * (0.45 + 0.55 * R.amount) * (0.8 + 0.2 * R.arena.buildW)), sp = 24 + 40 * hot + 20 * m.high;
        c.fillStyle = "rgba(225,240,255,.6)";
        for (let i = 0; i < n; i++) {
          const f = this.flakes[i], k = ((f.y * v.floorY * 1.2 + m.time * sp * f.sp) % (v.floorY * 1.2));
          const x = ((f.x * v.w * 1.2 - v.camX * v.scale * 0.6 + m.time * 12 * f.sp + Math.sin(m.time * 0.9 + f.ph) * 14) % (v.w * 1.2) + v.w * 1.2) % (v.w * 1.2) - v.w * 0.1;
          c.fillRect(x, k, f.s, f.s);
        }
      },
    }
  );
}
