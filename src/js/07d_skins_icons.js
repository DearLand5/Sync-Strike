/* =====================================================================
   Четыре «культовых» скина игрока: жуткий мим, кричащий убийца в белой
   маске, наёмник в строгом костюме, король поп-сцены. Оригинальные
   архетипы по духу жанров (слэшер, неонуар, поп-сцена 80-х) — без чужих
   персонажей, имён, логотипов и торговых марок.
   Идёт после 07c: дополняет SKINS / HEAD_PARTS / BACK_PARTS / MARK_PARTS.
   Правила те же: простые пути, без аллокаций в кадре, в tint (вспышка)
   всё рисуется одним цветом (_fr/_ac это делают).
   Необязательные поля скина (обрабатывает 07_anim): glove — цвет перчатки
   на одной руке, socks — цвет носков над ботинками.
   ===================================================================== */
Object.assign(SKINS, {
  // --- Хоррор ---
  mime:      { cat: "horror", from: "по мотивам хоррор-цирка", name: "Мим-мясник", mask: "#f6f6f8", eye: "#07080c", accent: "#b46bff", cloak: "#0a0a0d", head: "mimeface", scarf: null, hem: "scallop", mark: "mimesuit", back: "trashbag", wide: 1.1 },
  wail:      { cat: "horror", from: "по мотивам слэшеров", name: "Вопль", mask: "#f4f3ee", eye: "#ffffff", accent: "#9fe8ff", cloak: "#07080b", head: "longmask", scarf: null, hem: "jag", mark: "rips", back: "kitchenknife", wide: 1.15 },
  // --- Кино ---
  hitman:    { cat: "cinema", from: "по мотивам неонуара", name: "Контрактник", mask: "#d3b9a0", eye: "#0b0d12", accent: "#ffb02e", cloak: "#08090c", head: "suithair", scarf: null, hem: "straight", mark: "armorsuit", back: null, wide: 1.2 },
  popking:   { cat: "cinema", from: "по мотивам поп-сцены 80-х", name: "Король танца", mask: "#e6c5a2", eye: "#120a08", accent: "#ff3fcf", cloak: "#430b17", head: "popfedora", scarf: null, hem: "straight", mark: "marchjacket", back: null, wide: 1.1, glove: "#f7f9ff", socks: "#f7f9ff" },
});

/* ---------- головы ---------- */
Object.assign(HEAD_PARTS, {
  mimeface: {
    front(ctx, c) {
      // острый нос
      _poly(ctx, [4.6, 0.2, 8.6, 2.4, 4.8, 3.4]); _fr(ctx, c, "#f6f6f8", 0.5, 0.75);
      // колпачок: маленький чёрный конус, завалившийся назад, с белой каймой и помпоном
      ctx.beginPath(); ctx.moveTo(-5.6, -3.8); ctx.quadraticCurveTo(-6, -9.6, -2.4, -9.8); ctx.quadraticCurveTo(-4.4, -12.2, -7.8, -12.6);
      ctx.quadraticCurveTo(-1.2, -13.4, 2.2, -9.4); ctx.quadraticCurveTo(5.8, -9, 5.8, -4.4); ctx.quadraticCurveTo(0, -6.6, -5.6, -3.8); ctx.closePath();
      _fr(ctx, c, "#09090c", 0.7, 0.9);
      ctx.beginPath(); ctx.arc(-7.8, -12.6, 1.5, 0, TAU); ctx.fillStyle = c.tint || "#f6f6f8"; ctx.fill();
      if (c.tint) return;
      // белая кайма колпачка
      ctx.beginPath(); ctx.moveTo(-5.6, -3.8); ctx.quadraticCurveTo(0, -6.6, 5.8, -4.4);
      ctx.strokeStyle = "#f6f6f8"; ctx.lineWidth = 1.1; ctx.stroke();
      // чёрный грим: высокие брови, чёрточки под глазами, губки
      ctx.lineCap = "round"; ctx.strokeStyle = "#07070a"; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(-1.4, -2.6); ctx.quadraticCurveTo(0.6, -4.4, 2, -3); ctx.moveTo(2.4, -2.8); ctx.quadraticCurveTo(4.2, -4.6, 6, -3); ctx.stroke();
      ctx.lineWidth = 0.55;
      ctx.beginPath(); ctx.moveTo(0.4, 2.4); ctx.lineTo(0.2, 4.4); ctx.moveTo(4, 2.4); ctx.lineTo(4.2, 4.4); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(2.6, 5.6, 1.9, 0.9, 0, 0, TAU); ctx.fillStyle = "#07070a"; ctx.fill();
      ctx.beginPath(); ctx.moveTo(0.8, 5.5); ctx.lineTo(4.4, 5.4); ctx.strokeStyle = c.A(0.9); ctx.lineWidth = 0.3; ctx.stroke();
      // кончик носа неоном
      ctx.beginPath(); ctx.arc(7.7, 2.3, 0.9, 0, TAU); ctx.fillStyle = c.A(1); ctx.fill();
    },
  },
  longmask: {
    back(ctx, c) {
      // капюшон позади маски с колышущимся хвостом
      const w = Math.sin(c.now / 260);
      ctx.beginPath(); ctx.moveTo(-3, 8); ctx.bezierCurveTo(-11, 4, -10.6, -9, -0.8, -11.8); ctx.bezierCurveTo(7.8, -11.6, 8.4, -6, 6.4, -2);
      ctx.lineTo(-1, -4); ctx.closePath();
      _fr(ctx, c, "#07080b", 0.7, 0.85);
      ctx.beginPath(); ctx.moveTo(-6.6, 2); ctx.quadraticCurveTo(-10.4 + w, 8, -8.6 + w * 1.4, 14); ctx.lineTo(-3, 8); ctx.closePath();
      _fr(ctx, c, "#07080b", 0.7, 0.8);
    },
    front(ctx, c) {
      // длинная вытянутая маска
      ctx.beginPath(); ctx.moveTo(0, -7.6); ctx.bezierCurveTo(5.8, -7.6, 7, -1, 5.4, 4); ctx.bezierCurveTo(4.6, 8, 3.8, 12.4, 1.2, 13.2);
      ctx.bezierCurveTo(-1.6, 12, -3.6, 8, -5, 4); ctx.bezierCurveTo(-6.6, -1, -5.4, -7.6, 0, -7.6); ctx.closePath();
      ctx.fillStyle = c.tint || c.mc; ctx.fill();
      if (c.tint) return;
      ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = 0.5; ctx.stroke();
      // тень по левой щеке
      ctx.beginPath(); ctx.moveTo(-5, 4); ctx.bezierCurveTo(-3.6, 8, -1.6, 12, 1.2, 13.2); ctx.bezierCurveTo(-1.4, 9, -3, 5, -3.8, 0); ctx.closePath();
      ctx.fillStyle = "rgba(20,24,36,.18)"; ctx.fill();
      // провалы глаз-капли
      ctx.fillStyle = "#040406";
      for (let i = 0; i < 2; i++) {
        ctx.save(); ctx.translate(3.6 * i, 0); if (i) ctx.scale(0.9, 0.95);
        ctx.beginPath(); ctx.moveTo(0.4, -3.4); ctx.bezierCurveTo(2.8, -3.4, 2.9, 0.2, 1.1, 4.4); ctx.bezierCurveTo(0.2, 2.8, -1.9, 0.6, -1.3, -1.8); ctx.bezierCurveTo(-0.9, -3, -0.2, -3.4, 0.4, -3.4); ctx.fill();
        ctx.restore();
      }
      // вытянутый рот-провал и складка у носа
      ctx.beginPath(); ctx.moveTo(2.6, 5.6); ctx.bezierCurveTo(5, 6, 5, 11, 2.8, 11.6); ctx.bezierCurveTo(0.6, 11.4, 0.4, 6, 2.6, 5.6); ctx.fill();
      ctx.strokeStyle = "rgba(10,12,18,.55)"; ctx.lineWidth = 0.45; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(3, 3.4); ctx.lineTo(2.2, 4.6); ctx.stroke();
      // неоновая кромка маски
      ctx.beginPath(); ctx.moveTo(-5, 4); ctx.bezierCurveTo(-3.6, 8, -1.6, 12, 1.2, 13.2);
      ctx.strokeStyle = c.A(0.6); ctx.lineWidth = 0.6; ctx.stroke();
      // капюшон поверх лба и висков
      ctx.beginPath(); ctx.moveTo(-7.2, 7); ctx.bezierCurveTo(-10, -2, -7.6, -11, 0, -11.6); ctx.bezierCurveTo(7, -11.2, 8.8, -5, 7.4, -1);
      ctx.bezierCurveTo(6.6, -4.6, 3, -7.4, 0, -7.6); ctx.bezierCurveTo(-4.6, -7.4, -5.4, -2, -5.2, 4); ctx.closePath();
      ctx.fillStyle = "#06070a"; ctx.fill(); ctx.strokeStyle = c.A(0.8); ctx.lineWidth = 0.7; ctx.stroke();
    },
  },
  suithair: {
    back(ctx, c) {
      // длинные тёмные волосы до плеч
      const w = Math.sin(c.now / 520) * 0.7;
      ctx.beginPath(); ctx.moveTo(-0.5, -9.6); ctx.bezierCurveTo(-9.4, -9.2, -10.6, 0, -9.4, 6.4); ctx.lineTo(-9.8 + w, 13); ctx.lineTo(-6.6, 10);
      ctx.lineTo(-5.4 + w, 13.4); ctx.lineTo(-2.8, 8.4); ctx.lineTo(-1.2, 4); ctx.lineTo(0, -2); ctx.closePath();
      _fr(ctx, c, "#17110f", 0.6, 0.55);
    },
    front(ctx, c) {
      // волосы зачёсаны назад, прядь у виска
      ctx.beginPath(); ctx.moveTo(-6.2, 4.4); ctx.bezierCurveTo(-8.4, -8, 1, -11.8, 6.8, -7); ctx.bezierCurveTo(7.8, -5, 6.4, -3.8, 5, -4.6);
      ctx.bezierCurveTo(2, -6.6, -0.4, -6.2, -2.6, -4); ctx.bezierCurveTo(-3.8, -2.4, -4.2, 0.6, -4.2, 2.6); ctx.lineTo(-5, 6.4); ctx.closePath();
      _fr(ctx, c, "#17110f", 0.6, 0.6);
      // щетина и борода по линии челюсти, усы
      ctx.beginPath(); ctx.moveTo(-4.8, 1.8); ctx.bezierCurveTo(-4.8, 6.4, -2, 8.8, 1, 8.6); ctx.bezierCurveTo(4.2, 8.4, 5.8, 5.6, 5.6, 2.4);
      ctx.bezierCurveTo(4.6, 3.6, 3.6, 3.8, 2.6, 3.8); ctx.quadraticCurveTo(0.4, 4.8, -1.8, 4.2); ctx.quadraticCurveTo(-3.6, 3.8, -4.8, 1.8); ctx.closePath();
      ctx.fillStyle = c.tint || "#26201d"; ctx.fill();
      if (c.tint) return;
      ctx.fillStyle = "rgba(255,255,255,.22)";
      for (let i = 0; i < 5; i++) ctx.fillRect(-2.6 + i * 1.7, 5.4 + (i % 2) * 1.5, 0.35, 0.35);
      // густые брови
      ctx.strokeStyle = "#17110f"; ctx.lineWidth = 0.9; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-1, -2.8); ctx.lineTo(2.2, -3.4); ctx.moveTo(2.9, -3.4); ctx.lineTo(5.6, -2.8); ctx.stroke();
      // тонкий шрам над бровью
      ctx.strokeStyle = c.A(0.5); ctx.lineWidth = 0.35;
      ctx.beginPath(); ctx.moveTo(5.2, -4.8); ctx.lineTo(5.6, -2.2); ctx.stroke();
    },
  },
  popfedora: {
    back(ctx, c) {
      // кудри на затылке
      ctx.fillStyle = c.tint || "#0f0a09";
      ctx.beginPath(); ctx.arc(-6, -2.4, 3.4, 0, TAU); ctx.arc(-7.6, 2.8, 3, 0, TAU); ctx.arc(-6.6, 7.6, 2.8, 0, TAU); ctx.arc(-4.6, 11.6, 2.2, 0, TAU); ctx.fill();
      if (!c.tint) {
        ctx.strokeStyle = c.A(0.6); ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.arc(-7.6, 2.8, 3, 2.4, 4.4); ctx.arc(-6.6, 7.6, 2.8, 2.4, 4.4); ctx.arc(-6, -2.4, 3.4, 3, 4.9); ctx.stroke();
      }
    },
    front(ctx, c) {
      // завитки у виска из-под шляпы
      ctx.fillStyle = c.tint || "#0f0a09";
      ctx.beginPath(); ctx.arc(-5, -1, 2.2, 0, TAU); ctx.arc(-5.4, 2.8, 2, 0, TAU); ctx.arc(-4.4, 6, 1.6, 0, TAU); ctx.fill();
      // тулья федоры с вмятиной
      ctx.beginPath(); ctx.moveTo(-5.4, -4.6); ctx.lineTo(-4.8, -10.2); ctx.quadraticCurveTo(-2, -11.6, 0.4, -10.4); ctx.quadraticCurveTo(3, -11.6, 5, -10); ctx.lineTo(5.8, -4.6); ctx.closePath();
      _fr(ctx, c, "#0b0b0f", 0.6, 0.7);
      // поля: опущены к лицу
      ctx.beginPath(); ctx.moveTo(-10.4, -5.4); ctx.quadraticCurveTo(0, -3.4, 12, -1.2); ctx.quadraticCurveTo(2, -7, -10.4, -5.4); ctx.closePath();
      _fr(ctx, c, "#101016", 0.7, 0.9);
      if (c.tint) return;
      // белая лента
      ctx.beginPath(); ctx.moveTo(-5.2, -5.9); ctx.lineTo(5.6, -5.9); ctx.strokeStyle = "#f4f4f8"; ctx.lineWidth = 1; ctx.stroke();
      // блик на краю полей
      ctx.beginPath(); ctx.moveTo(6, -3.3); ctx.quadraticCurveTo(9, -2.6, 11.4, -1.4); ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 0.5; ctx.stroke();
      // искра-блеск у края полей
      const tw = Math.sin(c.now / 260);
      if (tw > 0.2) {
        const k = (tw - 0.2) * 3;
        ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 0.55; ctx.beginPath();
        ctx.moveTo(11.4, -4.2 - k); ctx.lineTo(11.4, -1.2 + k); ctx.moveTo(9.6 - k, -2.7); ctx.lineTo(13.2 + k, -2.7); ctx.stroke();
      }
    },
  },
});

/* ---------- снаряжение ---------- */
Object.assign(BACK_PARTS, {
  trashbag: {
    back(ctx, g) {
      // мусорный мешок на верёвке за плечом: покачивается, перевязан сверху
      const sw = Math.sin(g.now / 650) * 1.2, bx = -11 * g.wide + sw, by = g.hipY - 1.2;
      ctx.beginPath(); ctx.moveTo(-3, g.shoulderY + 1); ctx.quadraticCurveTo(-8 + sw * 0.4, g.shoulderY - 5, bx + 0.6, by - 7);
      ctx.strokeStyle = g.A(0.7); ctx.lineWidth = 0.5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx - 1.4, by - 5.6); ctx.bezierCurveTo(bx - 7.4, by - 4, bx - 7.8, by + 5, bx - 1.4, by + 6.6);
      ctx.bezierCurveTo(bx + 5.6, by + 7.2, bx + 7.2, by - 3, bx + 1.6, by - 5.6); ctx.closePath();
      ctx.fillStyle = "#171921"; ctx.fill(); ctx.strokeStyle = g.A(0.95); ctx.lineWidth = 0.6; ctx.stroke();
      // перевязанный «хвост» мешка
      _poly(ctx, [bx - 1.8, by - 5.4, bx - 3.2, by - 8.6, bx - 0.4, by - 6.8, bx + 1.6, by - 9, bx + 1.8, by - 5.4]); ctx.fillStyle = "#171921"; ctx.fill(); ctx.stroke();
      // глянцевый блик и складки
      ctx.beginPath(); ctx.moveTo(bx - 4.4, by - 1.4); ctx.quadraticCurveTo(bx - 4.8, by + 2.4, bx - 2.6, by + 4.4);
      ctx.strokeStyle = "rgba(255,255,255,.4)"; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx + 1, by - 3); ctx.lineTo(bx + 3, by + 1.6); ctx.moveTo(bx - 0.4, by + 1.4); ctx.lineTo(bx + 1.4, by + 5);
      ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = 0.4; ctx.stroke();
    },
  },
  kitchenknife: {
    back(ctx, g) {
      // нож за поясом: рукоять торчит над плечом, лезвие вдоль спины
      const sy = g.shoulderY;
      ctx.beginPath(); ctx.moveTo(-9.4, sy - 5.8); ctx.lineTo(-6.2, sy - 2.2); ctx.strokeStyle = "#141318"; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-6.8, sy - 3.4); ctx.lineTo(-5.4, sy - 1.6); ctx.strokeStyle = "#d8dce8"; ctx.lineWidth = 0.5; ctx.stroke();
      _poly(ctx, [-6.4, sy - 2.6, 8.2, g.hipY + 3.4, 9.4, g.hipY + 4.6, 8.8, g.hipY + 1, -4.8, sy - 0.8]);
      ctx.fillStyle = "#c9d0dc"; ctx.fill(); ctx.strokeStyle = g.A(0.95); ctx.lineWidth = 0.6; ctx.stroke();
    },
  },
});

/* ---------- знаки на груди ---------- */
Object.assign(MARK_PARTS, {
  mimesuit(ctx, g) {
    // чёрно-белый костюм: белые полосы и помпоны
    const sy = g.shoulderY, w = g.wide;
    ctx.lineCap = "butt"; ctx.strokeStyle = "rgba(246,246,248,.8)"; ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) { const y = sy + 1.8 + i * 2.5, h = (3.2 + i * 0.5) * w; ctx.moveTo(-h * 0.85, y); ctx.lineTo(h, y); }
    ctx.stroke();
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const y = sy + 3 + i * 2.8;
      ctx.fillStyle = g.A(1); ctx.beginPath(); ctx.arc(0.8, y, 1.35, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.beginPath(); ctx.arc(0.4, y - 0.4, 0.5, 0, TAU); ctx.fill();
    }
  },
  rips(ctx, g) {
    // рваные разрезы на балахоне с неоновым краем
    const sy = g.shoulderY;
    ctx.lineCap = "round"; ctx.lineWidth = 0.7; ctx.strokeStyle = g.A(0.8);
    ctx.beginPath(); ctx.moveTo(-1.8, sy + 1.6); ctx.lineTo(0.2, sy + 3.8); ctx.lineTo(-0.4, sy + 5); ctx.lineTo(1.8, sy + 8);
    ctx.moveTo(2.6, sy + 1.2); ctx.lineTo(3.4, sy + 4.4);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.2)"; ctx.lineWidth = 0.4;
    ctx.beginPath(); ctx.moveTo(-3, g.hipY - 5); ctx.lineTo(-1.6, g.hipY - 2); ctx.stroke();
  },
  armorsuit(ctx, g) {
    // пиджак-тройка: лацканы, рубашка и галстук, под пиджаком — пластины бронежилета
    const sy = g.shoulderY, hy = g.hipY;
    // бронепанель в разрезе пиджака
    ctx.beginPath(); ctx.moveTo(-1.8, sy + 3.2); ctx.lineTo(3, sy + 3.2); ctx.lineTo(2.6, hy - 2.8); ctx.lineTo(-1.4, hy - 2.8); ctx.closePath();
    ctx.fillStyle = "#2d313c"; ctx.fill();
    ctx.strokeStyle = g.A(0.85); ctx.lineWidth = 0.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-1.6, sy + 5.2); ctx.lineTo(2.8, sy + 5.2); ctx.moveTo(-1.5, sy + 7); ctx.lineTo(2.7, sy + 7); ctx.moveTo(0.6, sy + 3.2); ctx.lineTo(0.6, hy - 2.8);
    ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.lineWidth = 0.4; ctx.stroke();
    // рубашка у ворота и галстук
    _poly(ctx, [-1.8, sy, 3.2, sy, 0.7, sy + 3.6]); ctx.fillStyle = "#dfe3ee"; ctx.fill();
    _poly(ctx, [0.2, sy + 0.6, 1.3, sy + 0.6, 1.5, sy + 4.4, 0.75, sy + 5.4, 0, sy + 4.4]); ctx.fillStyle = "#14161d"; ctx.fill();
    ctx.strokeStyle = g.A(0.9); ctx.lineWidth = 0.35; ctx.stroke();
    // лацканы
    ctx.lineCap = "round"; ctx.strokeStyle = g.A(0.8); ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(-3.2, sy + 0.4); ctx.lineTo(-1.8, sy + 4.4); ctx.lineTo(-1.6, hy - 3); ctx.moveTo(3.6, sy + 0.4); ctx.lineTo(3.2, sy + 4.4); ctx.lineTo(2.9, hy - 3); ctx.stroke();
    // петличный значок
    ctx.fillStyle = g.A(1); ctx.beginPath(); ctx.arc(-2.6, sy + 3.2, 0.5, 0, TAU); ctx.fill();
  },
  marchjacket(ctx, g) {
    // «парадный» красный жакет: золотые эполеты, пуговицы, шнур и блёстки
    const sy = g.shoulderY, w = g.wide, gold = "#ffd54a";
    ctx.fillStyle = gold;
    for (const s of [-1, 1]) {
      const x = (s > 0 ? 2.4 : -5.8) * w;
      ctx.fillRect(x, sy - 0.9, 3.4, 1.5);
      ctx.fillRect(x + 0.2, sy + 0.6, 0.5, 1.4); ctx.fillRect(x + 1.5, sy + 0.6, 0.5, 1.4); ctx.fillRect(x + 2.7, sy + 0.6, 0.5, 1.4);
    }
    // стойка-воротник и золотой шнур
    ctx.lineCap = "round"; ctx.strokeStyle = gold; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(-3 * w, sy + 0.2); ctx.lineTo(3 * w, sy + 0.2); ctx.stroke();
    ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(-3 * w, sy + 2.6); ctx.quadraticCurveTo(0, sy + 4, 3 * w, sy + 2.6); ctx.moveTo(-3.4 * w, sy + 5); ctx.quadraticCurveTo(0, sy + 6.4, 3.4 * w, sy + 5); ctx.stroke();
    // пуговицы
    ctx.fillStyle = gold;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-1.4, sy + 2.2 + i * 2.4, 0.7, 0, TAU); ctx.arc(2.4, sy + 2.2 + i * 2.4, 0.7, 0, TAU); ctx.fill(); }
    // блёстки: искорки мерцают в разных местах
    for (let i = 0; i < 3; i++) {
      const tw = Math.sin(g.now / 240 + i * 2.1);
      if (tw > 0.4) { ctx.fillStyle = "rgba(255,255,255," + (0.5 + tw * 0.5).toFixed(2) + ")"; ctx.beginPath(); ctx.arc(-2.6 + i * 2.6, sy + 1.6 + (i * 5 % 4) * 1.6, 0.5 + (tw - 0.4) * 0.5, 0, TAU); ctx.fill(); }
    }
  },
});
