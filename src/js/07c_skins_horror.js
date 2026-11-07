/* =====================================================================
   Хоррор-скины игрока (ещё 6) и их детали. Оригинальные архетипы жанра
   (маньяк в безликой маске, жуткий клоун, фарфоровая кукла, призрачная
   девочка, монахиня, пугало) — без чужих персонажей, логотипов и франшиз.
   Идёт после 07b: дополняет SKINS / HEAD_PARTS / BACK_PARTS / MARK_PARTS /
   HEM_PARTS. Правила те же: простые пути без градиентов, без аллокаций в
   кадре, в tint (вспышка) всё рисуется одним цветом (_fr/_ac это делают).
   ===================================================================== */
Object.assign(SKINS, {
  // --- Хоррор ---
  stalker:   { cat: "horror", from: "ужасы о маньяках", name: "Безликий", mask: "#e4e8ee", eye: "#07080c", accent: "#5fd0ff", cloak: "#090b11", head: "blank", scarf: null, hem: "jag", mark: "tally", back: "machete", wide: 1.1 },
  clown:     { cat: "horror", from: "жуткий цирк", name: "Паяц", mask: "#f1edf6", eye: "#12041a", accent: "#39ff6a", cloak: "#0a0710", head: "clown", scarf: null, hem: "ruffle", mark: "pompoms", back: "balloon", wide: 1.2 },
  doll:      { cat: "horror", from: "одержимые игрушки", name: "Фарфоровая", mask: "#f3e6dc", eye: "#2f7bff", accent: "#e8c36a", cloak: "#0b080c", head: "doll", scarf: null, hem: "lace", mark: "ribbon", back: "windkey", wide: 1.1 },
  onryo:     { cat: "horror", from: "японские хорроры", name: "Онрё", mask: "#dfe8f0", eye: "#07080c", accent: "#d6e8ff", cloak: "#0a0b10", head: "longhair", scarf: null, hem: "wisp", mark: "drip", back: null, mono: true, rim: true },
  nun:       { cat: "horror", from: "готика в монастыре", name: "Инокиня", mask: "#e9e2d4", eye: "#ff7a3d", accent: "#ff7a3d", cloak: "#08080b", head: "habit", scarf: null, hem: "robe", mark: "rosary", back: null, wide: 1.2 },
  scarecrow: { cat: "horror", from: "поля и урожай", name: "Пугало", mask: "#8a7048", eye: "#ffc533", accent: "#ffc533", cloak: "#0c0905", head: "straw", scarf: null, hem: "straw", mark: "patches", back: "pitchfork", wide: 1.15 },
});

/* ---------- головы ---------- */
Object.assign(HEAD_PARTS, {
  blank: {
    back(ctx, c) {
      // глубокий капюшон за маской
      ctx.beginPath(); ctx.moveTo(-5.4, 5.6); ctx.bezierCurveTo(-10.4, 0, -9.4, -10.4, -0.6, -11.4); ctx.bezierCurveTo(7.4, -11.2, 8.2, -5.4, 6.2, -2.6);
      ctx.lineTo(0, -5); ctx.lineTo(-3, 2); ctx.closePath();
      _fr(ctx, c, "#0a0c12", 0.7, 0.85);
    },
    front(ctx, c) {
      if (c.tint) return;
      // безликая гладкая маска: только брови-линии, слеза, шов рта и трещина
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(10,12,18,.75)"; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(-2.4, -3.8); ctx.lineTo(2.2, -3); ctx.moveTo(2.8, -3); ctx.lineTo(6, -4.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-3.2, 4.8); ctx.quadraticCurveTo(1.6, 6.2, 5.6, 4.6); ctx.stroke();
      ctx.lineWidth = 0.45;
      for (let i = 0; i < 4; i++) { const x = -1.6 + i * 2.2; ctx.beginPath(); ctx.moveTo(x, 4.3); ctx.lineTo(x + 0.2, 6.3); ctx.stroke(); }
      // трещина по лбу
      ctx.beginPath(); ctx.moveTo(-1.6, -7.2); ctx.lineTo(-0.6, -5.6); ctx.lineTo(-1.6, -4.6); ctx.stroke();
      // слеза под глазом неоном
      ctx.strokeStyle = c.A(0.95); ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(0.5, 2.6); ctx.lineTo(0.2, 6.4); ctx.stroke();
    },
  },
  clown: {
    back(ctx, c) {
      // два пучка волос по бокам (передний — над лбом, задний — за затылком)
      ctx.fillStyle = c.tint || c.A(0.95);
      ctx.beginPath(); ctx.arc(-6.4, -4.6, 3.4, 0, TAU); ctx.arc(-8.6, -0.8, 2.6, 0, TAU); ctx.arc(-4.6, -8.4, 2.8, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(4.2, -9.2, 3.2, 0, TAU); ctx.arc(7.6, -7, 2.6, 0, TAU); ctx.arc(1.4, -10.6, 2.4, 0, TAU); ctx.fill();
    },
    front(ctx, c) {
      if (c.tint) {
        // силуэт воротника для вспышки
        ctx.beginPath(); ctx.moveTo(-7.6, 6.4);
        for (let i = 0; i < 6; i++) ctx.quadraticCurveTo(-6.4 + i * 2.6, 12.6, -5 + i * 2.6, 6.8);
        ctx.fillStyle = c.tint; ctx.fill();
        return;
      }
      // широкая улыбка до ушей с зубами
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-3.4, 2.2); ctx.quadraticCurveTo(1.6, 8.4, 6.2, 2); ctx.quadraticCurveTo(1.6, 5.2, -3.4, 2.2); ctx.closePath();
      ctx.fillStyle = "#16041b"; ctx.fill();
      ctx.strokeStyle = c.A(0.95); ctx.lineWidth = 0.7; ctx.stroke();
      ctx.strokeStyle = "#f1edf6"; ctx.lineWidth = 0.5;
      for (let i = 0; i < 4; i++) { const x = -1.6 + i * 1.9; ctx.beginPath(); ctx.moveTo(x, 3.3 + Math.abs(i - 1.5) * -0.3); ctx.lineTo(x + 0.1, 4.8 - Math.abs(i - 1.5) * 0.9); ctx.stroke(); }
      // слеза-линия из-под глаза и ромб над ним
      ctx.strokeStyle = c.A(0.95); ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(0.4, 2.4); ctx.quadraticCurveTo(-1.4, 4, -1.8, 6.4); ctx.stroke();
      _poly(ctx, [0.6, -5.8, 2.2, -4, 0.6, -2.8, -1, -4]); ctx.fillStyle = c.A(0.85); ctx.fill();
      // красный нос-шар
      ctx.beginPath(); ctx.arc(7, 1.4, 2.1, 0, TAU); ctx.fillStyle = c.A(1); ctx.fill();
      ctx.beginPath(); ctx.arc(6.5, 0.8, 0.7, 0, TAU); ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.fill();
      // жабо: волнистый воротник из лепестков
      ctx.beginPath(); ctx.moveTo(-7.8, 6.2);
      for (let i = 0; i < 6; i++) ctx.quadraticCurveTo(-6.4 + i * 2.6, 12.8, -5.1 + i * 2.6, 6.6);
      ctx.lineTo(7.6, 6); ctx.closePath();
      ctx.fillStyle = "#ece7f6"; ctx.fill(); ctx.strokeStyle = c.A(0.95); ctx.lineWidth = 0.7; ctx.stroke();
      ctx.strokeStyle = c.A(0.45); ctx.lineWidth = 0.4;
      ctx.beginPath(); for (let i = 0; i < 5; i++) { ctx.moveTo(-5.1 + i * 2.6, 7.2); ctx.lineTo(-5.1 + i * 2.6, 10.2); } ctx.stroke();
    },
  },
  doll: {
    back(ctx, c) {
      // локоны: гроздь завитков за затылком и на плече
      ctx.fillStyle = c.tint || "#1d1218";
      ctx.beginPath(); ctx.arc(-6, -3.4, 4.2, 0, TAU); ctx.arc(-8.2, 2.6, 3.4, 0, TAU); ctx.arc(-7.6, 8, 3.2, 0, TAU); ctx.arc(-5.4, 12, 2.6, 0, TAU); ctx.fill();
      if (!c.tint) {
        ctx.strokeStyle = c.A(0.7); ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.arc(-8.2, 2.6, 3.4, 2.4, 4.4); ctx.arc(-7.6, 8, 3.2, 2.4, 4.4); ctx.arc(-6, -3.4, 4.2, 3, 4.9); ctx.stroke();
      }
    },
    front(ctx, c) {
      // чёлка-шапочка и большой бант
      ctx.beginPath(); ctx.moveTo(-6.2, -1.4); ctx.bezierCurveTo(-7.4, -9.6, 6.8, -10.4, 6.6, -3.6); ctx.quadraticCurveTo(3, -6.6, 0.6, -4.4); ctx.quadraticCurveTo(-2.6, -6, -6.2, -1.4); ctx.closePath();
      _fr(ctx, c, "#1d1218", 0.6, 0.7);
      _poly(ctx, [-0.6, -9.6, -6.8, -12.2, -6.6, -8]); _ac(ctx, c, 0.95);
      _poly(ctx, [-0.6, -9.6, 5.8, -12.6, 5.6, -8]); _ac(ctx, c, 0.95);
      ctx.beginPath(); ctx.arc(-0.6, -9.8, 1.3, 0, TAU); ctx.fillStyle = c.tint || "#0b080c"; ctx.fill();
      if (c.tint) return;
      // трещина через лицо, лёгкий румянец, ресницы и бутон губ
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.fillStyle = c.A(0.3); ctx.beginPath(); ctx.ellipse(4.8, 3.2, 1.5, 0.9, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#7a2030"; ctx.beginPath(); ctx.ellipse(3.4, 5.1, 1.4, 0.7, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#06030a"; ctx.lineWidth = 0.55;
      ctx.beginPath(); ctx.moveTo(2.2, -4.6); ctx.lineTo(1.2, -2.2); ctx.lineTo(2.6, -0.8); ctx.lineTo(1.6, 1.6); ctx.lineTo(3.2, 3.4); ctx.lineTo(2.6, 5.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1.2, -2.2); ctx.lineTo(-0.4, -1.8); ctx.moveTo(1.6, 1.6); ctx.lineTo(0.2, 2.6); ctx.stroke();
      ctx.strokeStyle = c.A(0.7); ctx.lineWidth = 0.3;
      ctx.beginPath(); ctx.moveTo(2.6, -4.4); ctx.lineTo(1.6, -2.2); ctx.lineTo(3, -0.8); ctx.lineTo(2, 1.6); ctx.stroke();
      // выкол: чёрный скол на щеке
      _poly(ctx, [-3.6, 2.4, -2, 3.4, -3.8, 5]); ctx.fillStyle = "#06030a"; ctx.fill();
      ctx.strokeStyle = "#06030a"; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(-0.6, -3.5); ctx.lineTo(0.2, -3.9); ctx.moveTo(3.2, -3.5); ctx.lineTo(4, -4); ctx.stroke();
    },
  },
  longhair: {
    back(ctx, c) {
      // длинные волосы за плечами, кончики колышутся
      const w = Math.sin(c.now / 420) * 1.3, w2 = Math.sin(c.now / 310 + 1) * 1.1;
      ctx.beginPath(); ctx.moveTo(-1, -10.2); ctx.bezierCurveTo(-10.6, -8, -11.4, 6, -8.6 + w * 0.4, 14);
      ctx.lineTo(-10 + w, 23.4); ctx.lineTo(-6.6 + w2, 19); ctx.lineTo(-6.2 + w, 26); ctx.lineTo(-3.2 + w2, 18.6); ctx.lineTo(-1.6 + w, 22);
      ctx.lineTo(0, 12); ctx.lineTo(-0.6, 0); ctx.closePath();
      _fr(ctx, c, "#07070b", 0.6, 0.75);
    },
    front(ctx, c) {
      const w = Math.sin(c.now / 380) * 0.9, w2 = Math.sin(c.now / 290 + 1.7) * 0.8;
      // левая прядь (от макушки через лицо вниз), правая прядь и чёлка — между ними щель, где видно глаз
      ctx.beginPath(); ctx.moveTo(-7, 1); ctx.bezierCurveTo(-8.6, -10, 2, -12.6, 7.6, -7.4);
      ctx.bezierCurveTo(8.4, -4.4, 6.8, -3.4, 2.6, -3.4); ctx.quadraticCurveTo(-0.4, -3.4, -1.4, -1);
      ctx.lineTo(-1.2, 4); ctx.lineTo(-1.6 + w, 12.4); ctx.lineTo(-3.2 + w2, 9.6); ctx.lineTo(-4.8 + w, 15.8); ctx.lineTo(-6.6, 8.4); ctx.closePath();
      _fr(ctx, c, "#07070b", 0.6, 0.75);
      ctx.beginPath(); ctx.moveTo(3, -3.4); ctx.lineTo(7.4, -4.6); ctx.bezierCurveTo(8, 1, 7.2, 5, 5.6 + w2 * 0.3, 8.6);
      ctx.lineTo(6.4 + w2, 13.6); ctx.lineTo(3.8 + w, 9.2); ctx.lineTo(2.4, 4.4); ctx.closePath();
      _fr(ctx, c, "#07070b", 0.6, 0.75);
      if (c.tint) return;
      // отдельные блестящие пряди
      ctx.strokeStyle = c.A(0.55); ctx.lineWidth = 0.4;
      ctx.beginPath(); ctx.moveTo(-4.4, -9.4); ctx.quadraticCurveTo(-5.8, -2, -4.2, 6); ctx.moveTo(1.6, -11.2); ctx.quadraticCurveTo(-1, -6, -2.4, -2); ctx.moveTo(5.6, -8.4); ctx.quadraticCurveTo(6.6, -4.4, 5.2, -3.6); ctx.stroke();
    },
  },
  habit: {
    back(ctx, c) {
      // длинное покрывало за спиной, лёгкое колыхание
      const w = Math.sin(c.now / 520) * 1.2;
      ctx.beginPath(); ctx.moveTo(-1, -11); ctx.bezierCurveTo(-10, -9, -9.6, 4, -9 + w * 0.3, 10);
      ctx.lineTo(-11.4 + w, 22); ctx.lineTo(-6.6 + w * 0.6, 20); ctx.lineTo(-1.6, 12); ctx.lineTo(-1, 0); ctx.closePath();
      _fr(ctx, c, "#08080b", 0.7, 0.85);
    },
    front(ctx, c) {
      // чёрный чепец над лбом
      ctx.beginPath(); ctx.moveTo(-6.8, 4); ctx.bezierCurveTo(-9.6, -3, -7.6, -10.4, -0.4, -11); ctx.bezierCurveTo(6.8, -10.4, 8, -6, 7.4, -4.2);
      ctx.lineTo(-5.4, -2.8); ctx.closePath();
      _fr(ctx, c, "#08080b", 0.7, 0.85);
      // белая повязка на лбу и нагрудник-вимпл вокруг лица
      ctx.beginPath(); ctx.moveTo(-6.4, -2.6); ctx.lineTo(7.6, -4.2); ctx.lineTo(7.4, -2.4); ctx.lineTo(-6, -0.6); ctx.closePath();
      _fr(ctx, c, "#d7d2c6", 0.5, 0.7);
      ctx.beginPath(); ctx.moveTo(-6.6, 1); ctx.lineTo(-7.2, 11.6); ctx.lineTo(0.8, 9.4); ctx.lineTo(6.6, 6); ctx.lineTo(6, 3.4); ctx.quadraticCurveTo(0, 6.6, -4.4, 2.4); ctx.closePath();
      _fr(ctx, c, "#d7d2c6", 0.5, 0.7);
      if (c.tint) return;
      // небольшой крест на повязке неоном и складки вимпла
      ctx.strokeStyle = c.A(0.95); ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(1.4, -3.6); ctx.lineTo(1.2, -0.8); ctx.moveTo(0, -2.4); ctx.lineTo(2.8, -2.6); ctx.stroke();
      ctx.strokeStyle = "rgba(8,8,11,.35)"; ctx.lineWidth = 0.4;
      ctx.beginPath(); ctx.moveTo(-3, 5); ctx.lineTo(-3.6, 10.4); ctx.moveTo(1, 6.2); ctx.lineTo(0.8, 9.4); ctx.stroke();
    },
  },
  straw: {
    back(ctx, c) {
      // солома из-под шляпы: торчащие пучки сзади и сверху
      if (c.tint) return;
      ctx.lineCap = "round"; ctx.strokeStyle = c.A(0.9); ctx.lineWidth = 0.8;
      const w = Math.sin(c.now / 500) * 0.6;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const y = -4 + i * 2.2, l = 4.2 + (i * 5 % 3) * 1.6;
        ctx.moveTo(-5.4, y); ctx.lineTo(-5.4 - l, y + 1.2 + (i % 2 ? w : -w));
      }
      ctx.stroke();
    },
    front(ctx, c) {
      // стёжки рта и перекрестия-швы на мешковине
      if (!c.tint) {
        ctx.strokeStyle = "#1b1209"; ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(-3.6, 4.4); ctx.lineTo(5.6, 4);
        for (let i = 0; i < 6; i++) { const x = -3 + i * 1.7; ctx.moveTo(x, 2.9); ctx.lineTo(x + 0.6, 5.8); }
        ctx.moveTo(-5, -2.4); ctx.lineTo(-3.2, -0.6); ctx.moveTo(-3.2, -2.4); ctx.lineTo(-5, -0.6);
        ctx.stroke();
      }
      // потрёпанная шляпа с заплаткой, перекошенные поля
      ctx.beginPath(); ctx.moveTo(-5.6, -4.4); ctx.lineTo(-4.4, -10.2); ctx.quadraticCurveTo(-1, -12.6, 3.2, -10.8); ctx.lineTo(5.8, -4.6); ctx.closePath();
      _fr(ctx, c, "#2a1f0f", 0.6, 0.7);
      ctx.beginPath(); ctx.moveTo(-12.6, -3.2); ctx.quadraticCurveTo(-6, -6.4, 0, -5.6); ctx.quadraticCurveTo(7, -6.6, 13.2, -5); ctx.quadraticCurveTo(6, -2.2, 0, -3.6); ctx.quadraticCurveTo(-6, -2, -12.6, -3.2); ctx.closePath();
      _fr(ctx, c, "#33260f", 0.7, 0.9);
      if (c.tint) return;
      ctx.fillStyle = "#4a3818"; _poly(ctx, [0.2, -9.4, 3.4, -9.2, 3.6, -6.4, 0.4, -6.6]); ctx.fill();
      ctx.strokeStyle = c.A(0.8); ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(0.2, -9.4); ctx.lineTo(3.4, -9.2); ctx.lineTo(3.6, -6.4); ctx.lineTo(0.4, -6.6); ctx.closePath(); ctx.stroke();
      // солома, торчащая из дыр шляпы и поля
      ctx.strokeStyle = c.A(0.95); ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(10.6, -4.6); ctx.lineTo(13.6, -3.4); ctx.moveTo(10.4, -4.2); ctx.lineTo(12.6, -1.6); ctx.moveTo(-3, -11.6); ctx.lineTo(-4.4, -14.6); ctx.moveTo(-1.8, -11.9); ctx.lineTo(-1.6, -15); ctx.moveTo(-0.6, -11.8); ctx.lineTo(0.6, -14.4); ctx.stroke();
    },
  },
});

/* ---------- снаряжение ---------- */
Object.assign(BACK_PARTS, {
  machete: {
    back(ctx, g) {
      // мачете за спиной: рукоять над плечом, остриё выглядывает у бедра
      ctx.beginPath(); ctx.moveTo(-10, g.shoulderY - 6.4); ctx.lineTo(-6, g.shoulderY - 2.4); ctx.strokeStyle = "#1a1612"; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-6, g.shoulderY - 2.4); ctx.lineTo(8.6, g.hipY + 3.8); ctx.lineTo(10.4, g.hipY + 5); ctx.lineTo(9.6, g.hipY + 1.4); ctx.lineTo(-5, g.shoulderY - 0.8); ctx.closePath();
      ctx.fillStyle = "#222630"; ctx.fill(); ctx.strokeStyle = g.A(0.95); ctx.lineWidth = 0.6; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-6.6, g.shoulderY - 3); ctx.lineTo(-4.6, g.shoulderY - 1); ctx.strokeStyle = g.A(0.9); ctx.lineWidth = 0.8; ctx.stroke();
    },
  },
  balloon: {
    back(ctx, g) {
      // шарик на нитке: болтается за плечом
      const sw = Math.sin(g.now / 700) * 1.6, bx = -9 * g.wide + sw, by = g.shoulderY - 19 + Math.sin(g.now / 900) * 0.8;
      ctx.beginPath(); ctx.moveTo(-3, g.shoulderY + 1); ctx.quadraticCurveTo(-8 + sw * 0.4, g.shoulderY - 8, bx, by + 6.4);
      ctx.strokeStyle = g.A(0.7); ctx.lineWidth = 0.4; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(bx, by, 4.2, 5.2, 0.1 * sw, 0, TAU); ctx.fillStyle = g.A(0.92); ctx.fill();
      _poly(ctx, [bx - 0.9, by + 6.6, bx + 0.9, by + 6.6, bx, by + 5.2]); ctx.fill();
      ctx.beginPath(); ctx.ellipse(bx - 1.4, by - 1.8, 1, 1.7, 0.5, 0, TAU); ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fill();
    },
  },
  windkey: {
    front(ctx, g) {
      // заводной ключ торчит из спины и медленно проворачивается
      const kx = -9.6 * g.wide + g.fl * 0.3, ky = g.shoulderY + 6, sc = Math.cos(g.now / 700);
      ctx.beginPath(); ctx.moveTo(-3.6, ky); ctx.lineTo(kx, ky); ctx.strokeStyle = "#2a2418"; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(kx - 1.2, ky - 3.4 * sc, 1.9, Math.abs(sc) * 3.2 + 0.3, 0, 0, TAU);
      ctx.ellipse(kx - 1.2, ky + 3.4 * sc, 1.9, Math.abs(sc) * 3.2 + 0.3, 0, 0, TAU);
      ctx.fillStyle = "#1a160e"; ctx.fill(); ctx.strokeStyle = g.A(0.95); ctx.lineWidth = 0.7; ctx.stroke();
    },
  },
  pitchfork: {
    back(ctx, g) {
      // вилы за плечом: черен и три зубца
      const bx = -9.6 * g.wide, top = g.shoulderY - 14;
      ctx.beginPath(); ctx.moveTo(bx - 1.2, g.hemY + 5); ctx.lineTo(-6.4, top); ctx.strokeStyle = "#2a1c10"; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-9.6, top + 2); ctx.lineTo(-9.6, top - 4); ctx.moveTo(-6.4, top + 2); ctx.lineTo(-6.4, top - 5.6); ctx.moveTo(-3.2, top + 2); ctx.lineTo(-3.2, top - 4);
      ctx.moveTo(-9.8, top + 2); ctx.lineTo(-3, top + 2);
      ctx.strokeStyle = "#1d1f26"; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.strokeStyle = g.A(0.9); ctx.lineWidth = 0.5; ctx.stroke();
    },
  },
});

/* ---------- знаки на груди ---------- */
Object.assign(MARK_PARTS, {
  tally(ctx, g) {
    // зарубки-счёт: четыре чёрточки и косая
    ctx.lineWidth = 0.7; ctx.lineCap = "round"; ctx.strokeStyle = g.A(0.85);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) { ctx.moveTo(-1.8 + i * 1.3, g.shoulderY + 2.6); ctx.lineTo(-1.8 + i * 1.3, g.shoulderY + 6.6); }
    ctx.moveTo(-2.6, g.shoulderY + 6); ctx.lineTo(3, g.shoulderY + 3);
    ctx.stroke();
  },
  pompoms(ctx, g) {
    // помпоны костюма вдоль груди
    for (let i = 0; i < 3; i++) {
      const y = g.shoulderY + 2.2 + i * 3.4;
      ctx.fillStyle = g.A(0.95); ctx.beginPath(); ctx.arc(0.8, y, 1.4, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.arc(0.4, y - 0.4, 0.5, 0, TAU); ctx.fill();
    }
  },
  ribbon(ctx, g) {
    // бантик и пуговка на платье
    const x = 0.8, y = g.shoulderY + 3.4;
    ctx.fillStyle = g.A(0.9);
    _poly(ctx, [x, y, x - 3.2, y - 1.6, x - 3.2, y + 1.6]); ctx.fill();
    _poly(ctx, [x, y, x + 3.2, y - 1.6, x + 3.2, y + 1.6]); ctx.fill();
    ctx.fillStyle = "#0b080c"; ctx.beginPath(); ctx.arc(x, y, 0.8, 0, TAU); ctx.fill();
    ctx.fillStyle = g.A(0.8); ctx.beginPath(); ctx.arc(x, y + 5, 0.8, 0, TAU); ctx.arc(x, y + 8, 0.8, 0, TAU); ctx.fill();
  },
  drip(ctx, g) {
    // мокрые потёки: тонкие полосы вниз с каплями на концах
    ctx.lineWidth = 0.6; ctx.lineCap = "round"; ctx.strokeStyle = g.A(0.7); ctx.fillStyle = g.A(0.9);
    const tt = g.now / 1400;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { const x = -1.6 + i * 2.4, y0 = g.shoulderY + 3 + i * 0.8, y1 = g.hipY - 3 + i * 1.2; ctx.moveTo(x, y0); ctx.lineTo(x + 0.2, y1); }
    ctx.stroke();
    for (let i = 0; i < 3; i++) { const ph = (tt + i * 0.37) % 1; ctx.beginPath(); ctx.arc(-1.4 + i * 2.4, g.hipY - 3 + i * 1.2 + ph * 2.4, 0.7 * (1 - ph * 0.5), 0, TAU); ctx.fill(); }
  },
  rosary(ctx, g) {
    // чётки: бусины по дуге и крестик
    const x0 = -1.4, y0 = g.shoulderY + 0.8, x1 = 2.4, y1 = g.hipY - 5;
    ctx.fillStyle = g.A(0.9);
    for (let i = 0; i < 6; i++) {
      const t = i / 5, x = x0 + (x1 - x0) * t + Math.sin(t * Math.PI) * 2.4, y = y0 + (y1 - y0) * t;
      ctx.beginPath(); ctx.arc(x, y, i === 3 ? 1.1 : 0.8, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = g.A(0.95); ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(x1, y1 + 0.6); ctx.lineTo(x1, y1 + 4.2); ctx.moveTo(x1 - 1.2, y1 + 1.8); ctx.lineTo(x1 + 1.2, y1 + 1.8); ctx.stroke();
  },
  patches(ctx, g) {
    // заплатки на ткани, пришитые крестиками
    ctx.lineWidth = 0.6; ctx.strokeStyle = g.A(0.9);
    const y = g.shoulderY + 3.4;
    ctx.fillStyle = "#3a2c14"; ctx.fillRect(-1.2, y, 4.4, 4); ctx.strokeRect(-1.2, y, 4.4, 4);
    ctx.beginPath(); ctx.moveTo(-0.6, y + 0.6); ctx.lineTo(0.4, y + 1.6); ctx.moveTo(0.4, y + 0.6); ctx.lineTo(-0.6, y + 1.6);
    ctx.moveTo(1.8, y + 2.4); ctx.lineTo(2.8, y + 3.4); ctx.moveTo(2.8, y + 2.4); ctx.lineTo(1.8, y + 3.4); ctx.stroke();
    ctx.fillStyle = "#2c2210"; ctx.fillRect(-3.4, g.hipY - 6.4, 3, 2.8); ctx.strokeRect(-3.4, g.hipY - 6.4, 3, 2.8);
  },
});

/* ---------- подолы ---------- */
Object.assign(HEM_PARTS, {
  ruffle(ctx, xr, xl, y) { for (let i = 0; i < 6; i++) ctx.quadraticCurveTo(lerp(xr, xl, (i + 0.5) / 6), y + 5, lerp(xr, xl, (i + 1) / 6), y + 0.4); },
  lace(ctx, xr, xl, y) { for (let i = 0; i < 11; i++) ctx.quadraticCurveTo(lerp(xr, xl, (i + 0.5) / 11), y + 2.8, lerp(xr, xl, (i + 1) / 11), y + 0.3); },
  straw(ctx, xr, xl, y) { for (let i = 0; i < 9; i++) { ctx.lineTo(lerp(xr, xl, (i + 0.5) / 9), y + 2 + (i * 7 % 4) * 1.6); ctx.lineTo(lerp(xr, xl, (i + 1) / 9), y + 0.3); } },
});
