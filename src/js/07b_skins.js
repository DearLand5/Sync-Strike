/* =====================================================================
   Дополнительные скины игрока и их детали (головы, спина, знаки, подолы).
   Скины оригинальные: архетипы кино и игр, без чужих персонажей и логотипов.
   Все детали — простые пути (без градиентов и внеэкранных холстов), цвета —
   через rgba()/mixc с кэшем. Чёрные силуэты с неоновой кромкой; в режиме
   tint (вспышка попадания) рисуются одним цветом.
   Скин: cat — категория экрана «Облик», from — вдохновение (подпись),
   mono — рисовать один глаз (повязка, линза, дыра в мешке).
   ===================================================================== */
const SKIN_CATS = [
  { id: "classic", name: "Классика" }, { id: "cinema", name: "Кино" }, { id: "games", name: "Игры" },
  { id: "fantasy", name: "Фэнтези" }, { id: "scifi", name: "Sci-Fi" }, { id: "horror", name: "Хоррор" },
];

Object.assign(SKINS, {
  // --- Кино ---
  drifter:   { cat: "cinema", from: "вестерн", name: "Странник", mask: "#d9b48c", eye: "#1a0f08", accent: "#ff8a3d", cloak: "#0e0906", head: "cowboy", scarf: "#ff8a3d", hem: "fringe", mark: "poncho", back: "rifle", wide: 1.18 },
  gumshoe:   { cat: "cinema", from: "нуар-детектив", name: "Сыщик", mask: "#cfd2dc", eye: "#07080c", accent: "#9fb8ff", cloak: "#08090e", head: "fedora", scarf: null, hem: "straight", mark: "lapel", back: null, wide: 1.2 },
  corsair:   { cat: "cinema", from: "пиратское приключение", name: "Корсар", mask: "#e2b98f", eye: "#140c08", accent: "#ffcf4a", cloak: "#0b0809", head: "tricorn", scarf: "#ffcf4a", hem: "jag", mark: "bones", back: "cutlass", mono: true, wide: 1.1 },
  luchador:  { cat: "cinema", from: "рестлинг-лучадор", name: "Лучадор", mask: "#141622", eye: "#0a0a10", accent: "#ff7a1a", cloak: "#0d0807", head: "luchador", scarf: null, hem: "fringe", mark: "belt", back: null, wide: 1.25, rim: true },
  punk:      { cat: "cinema", from: "панк-контркультура", name: "Панк", mask: "#e9dcff", eye: "#14101c", accent: "#ff2fb0", cloak: "#0a070d", head: "mohawk", scarf: null, hem: "jag", mark: "studs", back: "boombox" },
  // --- Игры ---
  knight:    { cat: "games", from: "рыцарский экшен-RPG", name: "Страж", mask: "#2a2e3a", eye: "#ffb13b", accent: "#ffb13b", cloak: "#08090c", head: "greathelm", scarf: null, hem: "plates", mark: "cross", back: "greatsword", wide: 1.2, rim: true },
  shinobi:   { cat: "games", from: "стелс-экшен", name: "Синоби", mask: "#d7c2a4", eye: "#08090d", accent: "#2ea8ff", cloak: "#06080e", head: "shinobi", scarf: "#2ea8ff", hem: "jag", mark: "wraps", back: "ninjato" },
  oni:       { cat: "games", from: "файтинг, демон они", name: "Они", mask: "#b91f2b", eye: "#ffe34a", accent: "#ff4a3a", cloak: "#0d0708", head: "oni", scarf: null, hem: "angular", mark: "tomoe", back: "ring", wide: 1.1 },
  cat:       { cat: "games", from: "платформер, кот-герой", name: "Кошка", mask: "#17151e", eye: "#ffd23f", accent: "#2ee6c8", cloak: "#07090b", head: "cat", scarf: "#2ee6c8", hem: "fork", mark: "paw", back: "tail", wide: 0.92, rim: true },
  jester:    { cat: "games", from: "рогалик, шут", name: "Арлекин", mask: "#f4eefc", eye: "#1a0d22", accent: "#d23bff", cloak: "#0b070e", head: "jester", scarf: null, hem: "points", mark: "diamond", back: null },
  // --- Фэнтези ---
  lamp:      { cat: "fantasy", from: "сияющий в темноте", name: "Светоч", mask: "#ffffff", eye: "#ffffff", accent: "#9fb2d4", cloak: "#07080b", head: "lumen", scarf: null, hem: "straight", mark: "orb", back: null, noEyes: true, wide: 0.95 },
  wizard:    { cat: "fantasy", from: "сказочный маг", name: "Маг", mask: "#e6e0d4", eye: "#0b1020", accent: "#5b8cff", cloak: "#070912", head: "wizard", scarf: null, hem: "robe", mark: "stars", back: "staff", wide: 1.15 },
  viking:    { cat: "fantasy", from: "северная сага", name: "Берсерк", mask: "#e8d3bd", eye: "#101820", accent: "#7fd8ff", cloak: "#0a0a0c", head: "norse", scarf: null, hem: "fur", mark: "algiz", back: "shield", wide: 1.2 },
  spartan:   { cat: "fantasy", from: "античный эпос", name: "Гоплит", mask: "#232733", eye: "#ff4538", accent: "#ff4538", cloak: "#0d0707", head: "spartan", scarf: null, hem: "kilt", mark: "lambda", back: "spear", wide: 1.3, rim: true },
  jackal:    { cat: "fantasy", from: "египетский миф", name: "Страж гробниц", mask: "#17171d", eye: "#ffc83a", accent: "#ffc83a", cloak: "#0a0908", head: "jackal", scarf: null, hem: "kilt", mark: "usekh", back: null, mono: true, rim: true },
  // --- Sci-Fi ---
  astronaut: { cat: "scifi", from: "космоопера", name: "Космонавт", mask: "#dff0ff", eye: "#06101a", accent: "#ff9f43", cloak: "#0a0c12", head: "dome", scarf: null, hem: "straight", mark: "patch", back: "tank", wide: 1.1 },
  robot:     { cat: "scifi", from: "ретро-фантастика, робот", name: "Автомат", mask: "#252a36", eye: "#9bff4a", accent: "#9bff4a", cloak: "#090a0d", head: "box", scarf: null, hem: "plates", mark: "panel", back: "gear", rim: true },
  mech:      { cat: "scifi", from: "аниме про мехов", name: "Пилот меха", mask: "#22262f", eye: "#ffd9d0", accent: "#ff5d3a", cloak: "#0a0809", head: "mech", scarf: null, hem: "angular", mark: "chev", back: "jet", rim: true },
  diver:     { cat: "scifi", from: "ретро-подводник", name: "Водолаз", mask: "#efe0c0", eye: "#ffe9b0", accent: "#ffb86b", cloak: "#0a0907", head: "diver", scarf: null, hem: "plates", mark: "gauge", back: "hose", wide: 1.15 },
  // --- Хоррор ---
  plague:    { cat: "horror", from: "средневековая чума", name: "Лекарь", mask: "#2a2923", eye: "#c8ff4a", accent: "#c8ff4a", cloak: "#08090a", head: "beak", scarf: null, hem: "straight", mark: "vials", back: "satchel", mono: true, wide: 1.15, rim: true },
  butcher:   { cat: "horror", from: "слэшер", name: "Мясник", mask: "#3a3226", eye: "#ff3030", accent: "#ff3030", cloak: "#0b0808", head: "sack", scarf: null, hem: "jag", mark: "stitch", back: "cleaver", mono: true, rim: true },
  vampire:   { cat: "horror", from: "готический вампир", name: "Граф", mask: "#efe8f2", eye: "#ff1f4d", accent: "#ff1f4d", cloak: "#0b0609", head: "vamp", scarf: null, hem: "bat", mark: "brooch", back: null, wide: 1.35 },
});

/* Ореол и комок света «Светоча»: [радиус, прозрачность], от внешнего круга к внутреннему (в low — два кольца). */
const LUMEN_HALO = []; for (let i = 0; i < 12; i++) LUMEN_HALO.push([28 - i * 1.6, 0.012 + 0.0042 * i]);
const LUMEN_HALO_LOW = [[22, 0.05], [15, 0.07], [10, 0.1]];
const LUMEN_ORB = [[9, 0.04], [7.5, 0.05], [6, 0.08], [4.6, 0.14], [3.4, 0.3]];
const SKIN_C = { tint: null, accent: "#ffffff", mc: "#ffffff", hq: false, now: 0, boost: 0, A: null };
SKIN_C.A = a => rgba(SKIN_C.accent, a);
const SKIN_G = { accent: "#ffffff", wide: 1, shoulderY: 0, hipY: 0, hemY: 0, fl: 0, hq: false, now: 0, A: null };
SKIN_G.A = a => rgba(SKIN_G.accent, a);

/** Залить цветом и обвести неоном (в tint — только заливка одним цветом). */
function _fr(ctx, c, col, w, a) {
  ctx.fillStyle = c.tint || col; ctx.fill();
  if (!c.tint) { ctx.strokeStyle = c.A(a); ctx.lineWidth = w; ctx.stroke(); }
}
/** Линия неоном (только не в tint). */
function _ln(ctx, c, w, a) { if (!c.tint) { ctx.strokeStyle = c.A(a); ctx.lineWidth = w; ctx.stroke(); } }
/** Заливка акцентным цветом (в tint — цветом вспышки). */
function _ac(ctx, c, a) { ctx.fillStyle = c.tint || c.A(a); ctx.fill(); }
function _poly(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); }

/* ---------- головы: back — позади маски, front — поверх неё ---------- */
const HEAD_PARTS = {
  lumen: {
    // голова — раскалённый свет без лица: мягкий ореол концентрическими кругами (без градиентов), медленное «дыхание»
    back(ctx, c) {
      if (c.tint) return;
      const br = 0.5 + 0.5 * Math.sin(c.now / 1100), k = 0.9 + 0.1 * br + 0.35 * Math.min(1, c.boost);
      const R = c.hq ? LUMEN_HALO : LUMEN_HALO_LOW;
      for (let i = 0; i < R.length; i++) {
        ctx.beginPath(); ctx.arc(0.4, -0.2, R[i][0] * (0.94 + 0.06 * br), 0, TAU);
        ctx.fillStyle = rgba("#ffffff", Math.round(R[i][1] * k * 50) / 50); ctx.fill();
      }
    },
    front(ctx, c) {
      // ядро: овал белого света с мягкой кромкой
      ctx.beginPath(); ctx.ellipse(0.4, -0.2, 6.9, 8.4, 0.04, 0, TAU);
      ctx.fillStyle = c.tint || "rgba(255,255,255,.4)"; ctx.fill();
      ctx.beginPath(); ctx.ellipse(0.4, -0.2, 5.9, 7.5, 0.04, 0, TAU);
      ctx.fillStyle = c.tint || "#ffffff"; ctx.fill();
    },
  },
  cowboy: {
    front(ctx, c) {
      // платок на шее
      _poly(ctx, [-5.4, 5.6, 5.8, 5.2, 0.6, 10.6]); _ac(ctx, c, 0.9);
      // тулья с вмятиной и поля с загнутыми краями
      ctx.beginPath(); ctx.moveTo(-5.2, -4.4); ctx.lineTo(-4.6, -10.4); ctx.quadraticCurveTo(-1.4, -8.4, 0.6, -10.6); ctx.quadraticCurveTo(3, -8.4, 5, -10.4); ctx.lineTo(5.6, -4.4); ctx.closePath();
      _fr(ctx, c, "#17110c", 0.6, 0.7);
      ctx.beginPath(); ctx.moveTo(-12.4, -6.6); ctx.quadraticCurveTo(0, -1.2, 12.8, -6.8); ctx.quadraticCurveTo(0, -6.6, -12.4, -6.6); ctx.closePath();
      _fr(ctx, c, "#1b140e", 0.7, 0.85);
      if (!c.tint) { ctx.beginPath(); ctx.moveTo(-4.8, -6.9); ctx.lineTo(5.2, -6.9); ctx.strokeStyle = c.A(0.9); ctx.lineWidth = 0.9; ctx.stroke(); }
    },
  },
  fedora: {
    front(ctx, c) {
      // воротник плаща, поднятый у скулы
      _poly(ctx, [-6.6, 0.4, -6.4, 8.8, 0.4, 8.2, -2.4, 4.4]); _fr(ctx, c, "#0b0c11", 0.6, 0.6);
      ctx.beginPath(); ctx.moveTo(-5.4, -4.2); ctx.quadraticCurveTo(-5.6, -10.8, 0, -10.4); ctx.quadraticCurveTo(5.8, -10.8, 5.6, -4.2); ctx.closePath();
      _fr(ctx, c, "#14151c", 0.6, 0.7);
      if (!c.tint) { ctx.beginPath(); ctx.moveTo(-0.2, -9.9); ctx.lineTo(0.4, -5.6); ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = 0.9; ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(-10.4, -4.6); ctx.quadraticCurveTo(0, -1.6, 11.6, -4.9); ctx.quadraticCurveTo(0, -6.4, -10.4, -4.6); ctx.closePath();
      _fr(ctx, c, "#181a22", 0.7, 0.9);
      if (!c.tint) {
        ctx.beginPath(); ctx.moveTo(-5.2, -6.1); ctx.lineTo(5.6, -6.1); ctx.strokeStyle = rgba("#ffffff", 0.22); ctx.lineWidth = 0.9; ctx.stroke();
        // сигарета с огоньком
        ctx.beginPath(); ctx.moveTo(4.6, 4.6); ctx.lineTo(9.4, 3.8); ctx.strokeStyle = "#d8d8e0"; ctx.lineWidth = 0.8; ctx.stroke();
        ctx.fillStyle = c.A(0.7 + 0.3 * Math.sin(c.now / 220)); ctx.beginPath(); ctx.arc(9.6, 3.8, 0.7, 0, TAU); ctx.fill();
      }
    },
  },
  tricorn: {
    back(ctx, c) {
      // перо за шляпой
      if (c.tint) return;
      ctx.beginPath(); ctx.moveTo(-3.6, -9.6); ctx.quadraticCurveTo(-9.4, -13.4 + Math.sin(c.now / 300) * 0.6, -12, -8.6); ctx.quadraticCurveTo(-8, -10, -3.6, -9.6);
      ctx.fillStyle = c.A(0.8); ctx.fill();
    },
    front(ctx, c) {
      // чёрная повязка на правом глазу и лямка
      if (!c.tint) {
        ctx.beginPath(); ctx.moveTo(-5.8, -3.4); ctx.lineTo(6.2, -4); ctx.strokeStyle = "#0a0a0c"; ctx.lineWidth = 0.9; ctx.stroke();
      }
      ctx.beginPath(); ctx.ellipse(4.1, -0.2, 2.5, 2.9, 0.1, 0, TAU); ctx.fillStyle = c.tint || "#0a0a0c"; ctx.fill();
      if (!c.tint) { ctx.strokeStyle = c.A(0.55); ctx.lineWidth = 0.5; ctx.stroke(); }
      // треуголка
      ctx.beginPath(); ctx.moveTo(-11, -3.4); ctx.lineTo(-4.6, -10); ctx.lineTo(0.8, -8.2); ctx.lineTo(6.2, -10.4); ctx.lineTo(12.2, -3.8); ctx.quadraticCurveTo(0.6, -1.4, -11, -3.4); ctx.closePath();
      _fr(ctx, c, "#141115", 0.7, 0.9);
      if (!c.tint) { ctx.beginPath(); ctx.moveTo(-4.6, -9.4); ctx.lineTo(0.8, -7.8); ctx.lineTo(6.2, -9.8); ctx.strokeStyle = c.A(0.95); ctx.lineWidth = 0.6; ctx.stroke(); }
    },
  },
  luchador: {
    back(ctx, c) {
      // завязки маски
      if (c.tint) return;
      const w = Math.sin(c.now / 130) * 1.3;
      ctx.strokeStyle = c.A(0.95); ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(-5.8, -1); ctx.quadraticCurveTo(-9.4, -0.6, -12.4, 2.4 + w); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-5.8, -1); ctx.quadraticCurveTo(-9, -3.4, -11.6, -1.4 - w); ctx.stroke();
    },
    front(ctx, c) {
      // узор маски: «звезда» вокруг глаз, полоса по лбу и рот
      if (c.tint) return;
      ctx.beginPath(); ctx.moveTo(-3.8, -0.4); ctx.lineTo(-0.8, -4.6); ctx.lineTo(2.4, -2.2); ctx.lineTo(6.6, -4.4); ctx.lineTo(6.8, 0.4); ctx.lineTo(3.4, 3.4); ctx.lineTo(-0.8, 2.6); ctx.closePath();
      ctx.fillStyle = c.A(0.92); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0.2, -7.4); ctx.lineTo(1.8, -7.4); ctx.lineTo(1.6, -3.4); ctx.lineTo(0.6, -3.4); ctx.closePath(); ctx.fillStyle = c.A(0.8); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-1.4, 4.4); ctx.lineTo(4.4, 4.2); ctx.lineTo(3.2, 6.4); ctx.lineTo(-0.2, 6.6); ctx.closePath(); ctx.fillStyle = c.A(0.85); ctx.fill();
    },
  },
  mohawk: {
    back(ctx, c) {
      // ирокез: зубцы вдоль макушки
      ctx.beginPath(); ctx.moveTo(-5.6, -3.4);
      const xs = [-5.6, -3.8, -1.8, 0.2, 2.2, 4.2], hs = [-10.6, -14.6, -12.4, -15.4, -12, -10.2];
      for (let i = 0; i < xs.length; i++) { ctx.lineTo(xs[i] + 0.6, hs[i] + 3.6); ctx.lineTo(xs[i] + 1.2, hs[i]); }
      ctx.lineTo(5.6, -5.6); ctx.lineTo(5, -7.4); ctx.lineTo(-4.8, -7.4); ctx.closePath();
      _fr(ctx, c, mixc(c.accent, "#000000", 0.45), 0.7, 0.95);
    },
    front(ctx, c) {
      if (c.tint) return;
      // булавка-серьга и шипы на воротнике
      ctx.beginPath(); ctx.arc(-5.8, 3.4, 1.2, 0, TAU); ctx.strokeStyle = "#cfd0d8"; ctx.lineWidth = 0.5; ctx.stroke();
      ctx.fillStyle = c.A(0.95);
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-4 + i * 3, 7.8); ctx.lineTo(-2.8 + i * 3, 10); ctx.lineTo(-1.8 + i * 3, 7.6); ctx.fill(); }
      // подводка под глазами
      ctx.beginPath(); ctx.moveTo(-1, 2.6); ctx.lineTo(6.2, 2.4); ctx.strokeStyle = c.A(0.7); ctx.lineWidth = 0.7; ctx.stroke();
    },
  },
  greathelm: {
    back(ctx, c) {
      // плюмаж, развевается назад
      const w = Math.sin(c.now / 260) * 0.8;
      ctx.beginPath(); ctx.moveTo(-1, -8.2); ctx.quadraticCurveTo(-6, -15 + w, -13 + w * 2, -9 + w); ctx.quadraticCurveTo(-8, -9.6, -4.4, -6.8); ctx.closePath();
      _ac(ctx, c, 0.85);
    },
    front(ctx, c) {
      ctx.beginPath(); ctx.moveTo(-6.8, -8.4); ctx.lineTo(6.4, -8.4); ctx.lineTo(7.2, 3.4); ctx.lineTo(3.8, 7.8); ctx.lineTo(-4, 7.8); ctx.lineTo(-7, 3); ctx.closePath();
      _fr(ctx, c, "#1a1d26", 0.8, 0.9);
      if (c.tint) return;
      // прорезь для глаз, крест-ребро, дыхательные отверстия
      ctx.fillStyle = "#04050a"; ctx.fillRect(-3, -3.4, 10.4, 4.6);
      ctx.beginPath(); ctx.moveTo(2.6, -8.4); ctx.lineTo(2.6, -3.4); ctx.moveTo(2.6, 1.2); ctx.lineTo(2.6, 7.6); ctx.strokeStyle = c.A(0.5); ctx.lineWidth = 0.7; ctx.stroke();
      ctx.fillStyle = c.A(0.8); for (let i = 0; i < 3; i++) ctx.fillRect(4.6, 3 + i * 1.5, 1.3, 0.6);
      ctx.beginPath(); ctx.moveTo(-5, -6.4); ctx.quadraticCurveTo(-1, -8.2, 3.8, -7.4); ctx.strokeStyle = rgba("#ffffff", 0.16); ctx.lineWidth = 0.6; ctx.stroke();
    },
  },
  shinobi: {
    back(ctx, c) {
      // концы повязки
      if (c.tint) return;
      const w = Math.sin(c.now / 110) * 1.7;
      ctx.strokeStyle = c.A(1); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-5.8, -2.6); ctx.quadraticCurveTo(-9.6, -1.6, -13.6, 1.4 + w); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-5.8, -2.6); ctx.quadraticCurveTo(-9.2, -4.4, -12.4, -3.4 - w * 0.7); ctx.stroke();
    },
    front(ctx, c) {
      // капюшон-маска: открыта только полоса глаз
      ctx.beginPath(); ctx.moveTo(-6.4, -3.6); ctx.bezierCurveTo(-6.8, -9.4, 6.8, -9.6, 6.4, -3.6); ctx.closePath(); _fr(ctx, c, "#0c0e15", 0.6, 0.55);
      ctx.beginPath(); ctx.moveTo(-6, 2.6); ctx.lineTo(6.4, 2.4); ctx.quadraticCurveTo(5.4, 6, 0, 7.6); ctx.quadraticCurveTo(-4.8, 7, -6, 2.6); ctx.closePath(); _fr(ctx, c, "#0c0e15", 0.6, 0.55);
      if (!c.tint) {
        ctx.beginPath(); ctx.moveTo(-6.2, -3.4); ctx.quadraticCurveTo(0, -4.6, 6.4, -3.6); ctx.strokeStyle = c.A(1); ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(-5.6, -3.2, 1.1, 0, TAU); ctx.fillStyle = c.A(1); ctx.fill();
      }
    },
  },
  oni: {
    back(ctx, c) {
      // грива и прямые рога
      ctx.beginPath(); ctx.moveTo(-6, 2);
      ctx.lineTo(-10.4, -1); ctx.lineTo(-8.6, -3.8); ctx.lineTo(-12.2, -7.4); ctx.lineTo(-7.8, -7.6); ctx.lineTo(-8.4, -12.4); ctx.lineTo(-3.8, -9); ctx.lineTo(-1.4, -12); ctx.lineTo(0.6, -8); ctx.lineTo(0, 0); ctx.closePath();
      _fr(ctx, c, mixc(c.accent, "#000000", 0.6), 0.7, 0.9);
      const horn = c.tint || "#e4d8bf";
      ctx.fillStyle = horn;
      ctx.beginPath(); ctx.moveTo(-3.2, -6.6); ctx.lineTo(-4.4, -15); ctx.lineTo(-0.6, -7.4); ctx.fill();
      ctx.beginPath(); ctx.moveTo(2.6, -7); ctx.lineTo(3.6, -15.6); ctx.lineTo(6, -5.6); ctx.fill();
    },
    front(ctx, c) {
      if (c.tint) return;
      // хмурые брови, клыки и полосы
      ctx.beginPath(); ctx.moveTo(-3.4, -3.4); ctx.lineTo(1.8, -2.4); ctx.lineTo(6.6, -4.8); ctx.strokeStyle = "#1a0508"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = "#f2ead8";
      ctx.beginPath(); ctx.moveTo(-0.8, 5.2); ctx.lineTo(-0.2, 2.4); ctx.lineTo(0.8, 5.2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(3, 5.4); ctx.lineTo(3.8, 2.2); ctx.lineTo(4.8, 5.2); ctx.fill();
      ctx.strokeStyle = c.A(0.9); ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(-3.8, 3); ctx.lineTo(-1.6, 4.4); ctx.moveTo(-4.6, 0.6); ctx.lineTo(-2.4, 2); ctx.stroke();
    },
  },
  cat: {
    back(ctx, c) {
      // уши с розовым внутри
      _poly(ctx, [-4.2, -5.6, -4.8, -13.6, 0.8, -7.4]); _fr(ctx, c, "#12121a", 0.7, 0.9);
      _poly(ctx, [1.6, -7.2, 4.6, -14, 6.2, -4.8]); _fr(ctx, c, "#12121a", 0.7, 0.9);
      if (!c.tint) { ctx.fillStyle = c.A(0.55); _poly(ctx, [-3.8, -7, -4.2, -11.6, -1, -8]); ctx.fill(); _poly(ctx, [2.8, -8, 4.5, -12, 5.2, -6.6]); ctx.fill(); }
    },
    front(ctx, c) {
      if (c.tint) return;
      // маска-домино вокруг глаз, усы, носик
      ctx.beginPath(); ctx.moveTo(-5.8, -2.6); ctx.quadraticCurveTo(0, -4.8, 6.4, -4.2); ctx.lineTo(7, 0.4); ctx.quadraticCurveTo(3.6, 3.4, -0.6, 2.4); ctx.quadraticCurveTo(-4, 2.6, -5.8, 0.4); ctx.closePath();
      ctx.fillStyle = "#0b0b12"; ctx.fill(); ctx.strokeStyle = c.A(0.6); ctx.lineWidth = 0.5; ctx.stroke();
      ctx.strokeStyle = c.A(0.75); ctx.lineWidth = 0.45;
      ctx.beginPath(); ctx.moveTo(6.2, 3.2); ctx.lineTo(11.6, 1.8); ctx.moveTo(6.4, 4.4); ctx.lineTo(11.8, 4.6); ctx.moveTo(6, 5.4); ctx.lineTo(10.6, 7.4); ctx.stroke();
      _poly(ctx, [5.6, 2.6, 7.4, 2.6, 6.5, 3.8]); ctx.fillStyle = c.A(0.95); ctx.fill();
    },
  },
  jester: {
    back(ctx, c) {
      // два рога колпака с бубенцами
      const sw = Math.sin(c.now / 200) * 1.2;
      ctx.beginPath(); ctx.moveTo(-5, -5); ctx.quadraticCurveTo(-11, -12, -14 + sw, -4 + sw * 0.6); ctx.quadraticCurveTo(-8.4, -7.4, -2, -6.6); ctx.closePath(); _fr(ctx, c, "#16091c", 0.7, 0.9);
      ctx.beginPath(); ctx.moveTo(2.4, -7); ctx.quadraticCurveTo(7, -15, 13.4 + sw, -8.6 - sw * 0.5); ctx.quadraticCurveTo(7.6, -9.6, 5.6, -5); ctx.closePath(); _fr(ctx, c, "#16091c", 0.7, 0.9);
      ctx.fillStyle = c.tint || "#ffe35a";
      ctx.beginPath(); ctx.arc(-14 + sw, -4 + sw * 0.6, 1.5, 0, TAU); ctx.arc(13.4 + sw, -8.6 - sw * 0.5, 1.5, 0, TAU); ctx.fill();
    },
    front(ctx, c) {
      if (c.tint) return;
      // шапочка с ромбом, ромб под глазом, зубчатый воротник
      ctx.beginPath(); ctx.moveTo(-6.2, -3.4); ctx.bezierCurveTo(-6.4, -9.6, 6.6, -9.6, 6.4, -3.4); ctx.quadraticCurveTo(0, -5.2, -6.2, -3.4); ctx.closePath(); _fr(ctx, c, "#16091c", 0.6, 0.8);
      _poly(ctx, [0.4, -8.2, 2.4, -6, 0.4, -4.2, -1.6, -6]); ctx.fillStyle = c.A(0.9); ctx.fill();
      _poly(ctx, [1.8, 2.8, 3.6, 4.8, 1.8, 6.8, 0, 4.8]); ctx.fillStyle = c.A(0.55); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-5.6, 7.2);
      for (let i = 0; i < 5; i++) { ctx.lineTo(-4.2 + i * 2.6, 10.2); ctx.lineTo(-2.9 + i * 2.6, 7.2); }
      ctx.fillStyle = c.A(0.9); ctx.fill();
    },
  },
  wizard: {
    front(ctx, c) {
      // длинная борода
      ctx.beginPath(); ctx.moveTo(-3.6, 3.6); ctx.lineTo(6, 3.2); ctx.quadraticCurveTo(4.6, 10, 0.6, 14.6); ctx.quadraticCurveTo(-3.2, 9, -3.6, 3.6); ctx.closePath();
      ctx.fillStyle = c.tint || c.mc; ctx.fill();
      if (!c.tint) { ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(0.4, 6); ctx.lineTo(0.6, 13); ctx.moveTo(3, 5.6); ctx.lineTo(1.8, 11.4); ctx.stroke(); }

      // остроконечная шляпа с загнутым кончиком и полями
      ctx.beginPath(); ctx.moveTo(-5.8, -4.6); ctx.quadraticCurveTo(-4.4, -11, -9.8, -17); ctx.quadraticCurveTo(0.4, -12.6, 6, -4.6); ctx.closePath();
      _fr(ctx, c, "#0d1020", 0.7, 0.85);
      ctx.beginPath(); ctx.moveTo(-11, -4.2); ctx.quadraticCurveTo(0, -1.2, 11.8, -4.4); ctx.quadraticCurveTo(0, -6.8, -11, -4.2); ctx.closePath();
      _fr(ctx, c, "#12162a", 0.7, 0.9);
      if (!c.tint) {
        ctx.beginPath(); ctx.moveTo(-4.6, -6.2); ctx.lineTo(5, -6.2); ctx.strokeStyle = c.A(0.9); ctx.lineWidth = 0.9; ctx.stroke();
        // звёздочка
        const sx = -3.4, sy = -10.4; ctx.fillStyle = c.A(0.95);
        _poly(ctx, [sx, sy - 1.6, sx + 0.5, sy - 0.5, sx + 1.6, sy, sx + 0.5, sy + 0.5, sx, sy + 1.6, sx - 0.5, sy + 0.5, sx - 1.6, sy, sx - 0.5, sy - 0.5]); ctx.fill();
      }
    },
  },
  norse: {
    back(ctx, c) {
      // дальний рог
      ctx.fillStyle = c.tint || "#9c9486";
      ctx.beginPath(); ctx.moveTo(-5.2, -4.4); ctx.quadraticCurveTo(-9.4, -5, -9.2, -11.4); ctx.quadraticCurveTo(-6.8, -7.4, -3.4, -6.4); ctx.fill();
    },
    front(ctx, c) {
      // коса-борода
      ctx.beginPath(); ctx.moveTo(-4.2, 4); ctx.lineTo(5.4, 3.6); ctx.quadraticCurveTo(5, 9, 2.8, 13.4); ctx.lineTo(0.6, 11); ctx.lineTo(-1.6, 13.6); ctx.quadraticCurveTo(-4, 9, -4.2, 4); ctx.closePath();
      ctx.fillStyle = c.tint || "#c0733a"; ctx.fill();
      if (!c.tint) { ctx.strokeStyle = "rgba(0,0,0,.3)"; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(0.6, 5); ctx.lineTo(0.6, 11); ctx.stroke(); ctx.fillStyle = c.A(0.9); ctx.fillRect(0, 8.4, 1.3, 0.9); }
      // шлем с наносником
      ctx.beginPath(); ctx.moveTo(-6.8, -1); ctx.quadraticCurveTo(-7, -10, 0.2, -10); ctx.quadraticCurveTo(7.6, -10, 7.2, -1); ctx.closePath();
      _fr(ctx, c, "#2a2e3a", 0.7, 0.85);
      ctx.beginPath(); ctx.moveTo(-6.8, -2.6); ctx.lineTo(7.4, -2.8); ctx.lineWidth = 1.2; ctx.strokeStyle = c.tint || "#44495a"; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4.6, -2.6); ctx.lineTo(5.2, 3.4); ctx.lineWidth = 1.3; ctx.stroke();
      // ближний рог
      ctx.fillStyle = c.tint || "#b8b0a0";
      ctx.beginPath(); ctx.moveTo(3.6, -8.2); ctx.quadraticCurveTo(9.8, -8.4, 9.4, -15); ctx.quadraticCurveTo(7.2, -10.6, 1.8, -9.6); ctx.fill();
    },
  },
  spartan: {
    front(ctx, c) {
      // шлем: купол, щёки, T-образный прорез; поперечный гребень
      ctx.beginPath(); ctx.moveTo(-7, 4.4); ctx.lineTo(-7.2, -2); ctx.quadraticCurveTo(-7.4, -9.6, 0, -9.6); ctx.quadraticCurveTo(7.6, -9.6, 7.4, -1.6); ctx.lineTo(7.2, 3.4); ctx.lineTo(4, 7.6); ctx.lineTo(-3.6, 7.6); ctx.closePath();
      _fr(ctx, c, "#1d212c", 0.8, 0.9);
      ctx.beginPath(); ctx.moveTo(-7.4, -7.4); ctx.quadraticCurveTo(0, -20, 7.8, -7); ctx.lineTo(5.6, -8); ctx.quadraticCurveTo(0, -14, -5.4, -8.2); ctx.closePath(); _ac(ctx, c, 0.95);
      if (c.tint) return;
      ctx.fillStyle = "#04050a"; ctx.fillRect(-3.2, -3.4, 10.8, 4.2); ctx.fillRect(2.2, 0.4, 2.4, 6.6);
      ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.lineWidth = 0.4; ctx.beginPath();
      for (let i = 0; i < 6; i++) { const x = -5.6 + i * 2.5; ctx.moveTo(x, -8.6 - Math.sin(i / 5 * Math.PI) * 4.8); ctx.lineTo(x + 0.4, -8); }
      ctx.stroke();
    },
  },
  jackal: {
    back(ctx, c) {
      // высокие уши
      const col = c.tint || "#14141a";
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(-5.2, -4); ctx.lineTo(-6.4, -15.6); ctx.lineTo(-1, -6.8); ctx.fill();
      ctx.beginPath(); ctx.moveTo(1, -6.8); ctx.lineTo(3.4, -16.2); ctx.lineTo(6, -4.4); ctx.fill();
      if (!c.tint) { ctx.strokeStyle = c.A(0.9); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-6.4, -15.6); ctx.lineTo(-1, -6.8); ctx.moveTo(3.4, -16.2); ctx.lineTo(6, -4.4); ctx.stroke(); }
    },
    front(ctx, c) {
      // вытянутая морда и подводка глаз
      ctx.beginPath(); ctx.moveTo(1.4, -3.4); ctx.lineTo(13.6, 1.4); ctx.lineTo(13.4, 3.6); ctx.lineTo(8, 4.4); ctx.lineTo(5, 7); ctx.lineTo(0.4, 6.2); ctx.closePath();
      _fr(ctx, c, "#111116", 0.7, 0.9);
      if (c.tint) return;
      ctx.beginPath(); ctx.moveTo(12.8, 3.4); ctx.lineTo(6.8, 4.2); ctx.strokeStyle = "#000"; ctx.lineWidth = 0.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(13.2, 1.9, 0.8, 0, TAU); ctx.fillStyle = "#000"; ctx.fill();
      ctx.beginPath(); ctx.moveTo(2.6, -0.8); ctx.lineTo(-4.4, -2.4); ctx.strokeStyle = c.A(0.95); ctx.lineWidth = 0.9; ctx.stroke();
    },
  },
  dome: {
    front(ctx, c) {
      // стеклянный шлем: кольцо, блик, воротник и антенна
      ctx.beginPath(); ctx.arc(0.4, -0.4, 9, 0, TAU);
      ctx.lineWidth = 2.2; ctx.strokeStyle = c.tint || "#1a1d27"; ctx.stroke();
      if (!c.tint) {
        ctx.lineWidth = 0.5; ctx.strokeStyle = c.A(0.85); ctx.beginPath(); ctx.arc(0.4, -0.4, 10.2, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(0.4, -0.4, 7.8, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(0.4, -0.4, 6.4, 3.5, 4.5); ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 0.9; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-6.6, -7.6); ctx.lineTo(-8.6, -12); ctx.strokeStyle = "#1a1d27"; ctx.lineWidth = 0.8; ctx.stroke();
        ctx.fillStyle = c.A(1); ctx.beginPath(); ctx.arc(-8.6, -12.2, 1, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = c.tint || "#1a1d27"; ctx.fillRect(-6, 7.4, 12.4, 3);
      if (!c.tint) { ctx.fillStyle = c.A(0.95); ctx.fillRect(-6, 8.4, 12.4, 0.8); }
    },
  },
  box: {
    back(ctx, c) {
      // антенна и болты-«уши»
      if (c.tint) { ctx.fillStyle = c.tint; ctx.fillRect(-8, -2, 2, 4); return; }
      ctx.beginPath(); ctx.moveTo(-1.6, -7); ctx.lineTo(-1.6, -12); ctx.strokeStyle = "#2f3441"; ctx.lineWidth = 0.9; ctx.stroke();
      const bl = 0.5 + 0.5 * Math.sin(c.now / 260);
      ctx.fillStyle = c.A(0.35 + 0.65 * bl); ctx.beginPath(); ctx.arc(-1.6, -12.8, 1.4, 0, TAU); ctx.fill();
      ctx.fillStyle = "#1c202a"; ctx.fillRect(-8.4, -2.6, 2.6, 5.2);
      ctx.strokeStyle = c.A(0.7); ctx.lineWidth = 0.5; ctx.strokeRect(-8.4, -2.6, 2.6, 5.2);
    },
    front(ctx, c) {
      // квадратная голова с экраном
      ctx.beginPath(); ctx.moveTo(-6.4, -7); ctx.lineTo(6.8, -7); ctx.lineTo(6.8, 6.4); ctx.lineTo(-6.4, 6.4); ctx.closePath();
      _fr(ctx, c, "#232733", 0.8, 0.9);
      if (c.tint) return;
      ctx.fillStyle = "#04070b"; ctx.fillRect(-4.8, -4.6, 10.8, 7.6);
      ctx.fillStyle = c.A(0.1); ctx.fillRect(-4.8, -4.6, 10.8, 7.6);
      // индикатор-эквалайзер вместо рта
      for (let i = 0; i < 4; i++) { const h = 0.8 + 1.4 * (0.5 + 0.5 * Math.sin(c.now / 150 + i * 1.7)); ctx.fillStyle = c.A(0.85); ctx.fillRect(-3.4 + i * 2.6, 6.2 - h - 0.2, 1.6, h); }
    },
  },
  mech: {
    front(ctx, c) {
      // шлем-купол с забралом и V-образным гребнем
      ctx.beginPath(); ctx.moveTo(-6.6, 3.4); ctx.lineTo(-7, -2); ctx.quadraticCurveTo(-7.2, -9.4, 0.4, -9.4); ctx.quadraticCurveTo(7.8, -9.4, 7.6, -1); ctx.lineTo(7.4, 3.6); ctx.lineTo(3.6, 7.2); ctx.lineTo(-3, 6.6); ctx.closePath();
      _fr(ctx, c, "#1e222c", 0.8, 0.9);
      ctx.beginPath(); ctx.moveTo(3, -9.2); ctx.lineTo(5.8, -16.2); ctx.lineTo(5.2, -9.2); ctx.lineTo(8.4, -15.2); ctx.lineTo(7.4, -8.4); ctx.closePath(); _ac(ctx, c, 0.95);
      if (c.tint) return;
      _poly(ctx, [-1.8, -3.6, 7.6, -4.4, 7.8, 2.2, -0.4, 3.2]); ctx.fillStyle = "#05070b"; ctx.fill();
      ctx.fillStyle = c.A(0.2); ctx.fill(); ctx.strokeStyle = c.A(0.9); ctx.lineWidth = 0.6; ctx.stroke();
      ctx.fillStyle = c.A(0.8); for (let i = 0; i < 3; i++) ctx.fillRect(-2.6 + i * 1.5, 4.8, 0.9, 1.8);
    },
  },
  diver: {
    front(ctx, c) {
      // медный шар-шлем с иллюминатором и заклёпками
      ctx.beginPath(); ctx.arc(0.4, -0.6, 9, 0, TAU);
      _fr(ctx, c, "#33281a", 1, 0.95);
      ctx.fillStyle = c.tint || "#33281a"; ctx.fillRect(-6, 7.4, 12.8, 3.2);
      if (c.tint) return;
      ctx.beginPath(); ctx.arc(3.4, -0.4, 5.2, 0, TAU); ctx.fillStyle = "#04121a"; ctx.fill();
      ctx.strokeStyle = c.A(1); ctx.lineWidth = 1.1; ctx.stroke();
      ctx.beginPath(); ctx.arc(3.4, -0.4, 3.6, 3.6, 4.5); ctx.strokeStyle = "rgba(255,255,255,.4)"; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.fillStyle = c.A(0.9);
      for (let i = 0; i < 5; i++) { const a = 2.2 + i * 0.5; ctx.beginPath(); ctx.arc(0.4 + Math.cos(a) * 7.6, -0.6 + Math.sin(a) * 7.6, 0.55, 0, TAU); ctx.fill(); }
      ctx.fillRect(-6, 8.6, 12.8, 0.6);
    },
  },
  beak: {
    front(ctx, c) {
      // широкополая шляпа, клюв, линза
      ctx.beginPath(); ctx.moveTo(3.4, -3); ctx.quadraticCurveTo(11, -3.2, 17, 4.6); ctx.quadraticCurveTo(10, 3.6, 3.6, 5); ctx.closePath();
      _fr(ctx, c, "#24231d", 0.7, 0.9);
      ctx.beginPath(); ctx.arc(1, -0.4, 3.4, 0, TAU);
      if (c.tint) { ctx.fillStyle = c.tint; ctx.fill(); } else { ctx.fillStyle = "#06080a"; ctx.fill(); ctx.strokeStyle = c.A(1); ctx.lineWidth = 0.9; ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(-5.4, -4.6); ctx.lineTo(-4.8, -9.4); ctx.lineTo(5, -9.4); ctx.lineTo(5.6, -4.6); ctx.closePath(); _fr(ctx, c, "#14150f", 0.6, 0.7);
      ctx.beginPath(); ctx.moveTo(-10.6, -4.4); ctx.quadraticCurveTo(0, -2.4, 11.6, -4.6); ctx.quadraticCurveTo(0, -6.6, -10.6, -4.4); ctx.closePath(); _fr(ctx, c, "#181912", 0.7, 0.9);
    },
  },
  sack: {
    front(ctx, c) {
      // мешок на голове с узлом сверху, дыра для глаза и стежки на «рту»
      ctx.beginPath(); ctx.moveTo(-6.4, 4); ctx.bezierCurveTo(-8, -3, -6, -8.6, -1.2, -9.4); ctx.lineTo(-3.4, -13.4); ctx.lineTo(1.4, -9.6); ctx.bezierCurveTo(7.4, -8.4, 7.8, -2, 6.4, 3.6); ctx.quadraticCurveTo(3, 8, 0, 7.8); ctx.quadraticCurveTo(-4.6, 7.4, -6.4, 4); ctx.closePath();
      _fr(ctx, c, "#3a3226", 0.7, 0.7);
      if (c.tint) return;
      ctx.beginPath(); ctx.arc(0.6, -0.2, 2.5, 0, TAU); ctx.fillStyle = "#05030a"; ctx.fill();
      ctx.strokeStyle = "#120d08"; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(2.8, -2.6); ctx.lineTo(6, 1.2); ctx.moveTo(6, -2.6); ctx.lineTo(2.8, 1.2);
      ctx.moveTo(-4, 4.8); ctx.lineTo(5.4, 4.4);
      for (let i = 0; i < 5; i++) { ctx.moveTo(-3.2 + i * 2.2, 3.8); ctx.lineTo(-3.2 + i * 2.2, 5.8); }
      ctx.stroke();
      ctx.strokeStyle = c.A(0.55); ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(-6.2, 6.6); ctx.lineTo(6, 6.2); ctx.stroke();
    },
  },
  vamp: {
    back(ctx, c) {
      // высокий воротник плаща с красной подкладкой
      _poly(ctx, [-7, 8.6, -10, -4.4, -3.4, 1.8, -1.2, 7.4]); _fr(ctx, c, "#0c0709", 0.7, 0.9);
      if (!c.tint) { ctx.fillStyle = c.A(0.55); _poly(ctx, [-6.2, 7.2, -8.6, -2.4, -3.4, 2.6, -2, 6.6]); ctx.fill(); }
    },
    front(ctx, c) {
      // зачёсанные волосы с мысом и клык
      ctx.beginPath(); ctx.moveTo(-6.4, 0); ctx.bezierCurveTo(-7.4, -9, 6, -10.4, 6, -2.4); ctx.lineTo(2.8, -4); ctx.lineTo(0.4, -5.4); ctx.lineTo(-2.2, -3.4); ctx.closePath();
      _fr(ctx, c, "#0a0709", 0.6, 0.7);
      if (!c.tint) { ctx.fillStyle = "#fff"; _poly(ctx, [2.6, 5.2, 3.6, 5.2, 3.2, 7.2]); ctx.fill(); }
    },
  },
};

/* ---------- снаряжение: back — позади плаща, front — поверх (координаты тела) ---------- */
const BACK_PARTS = {
  rifle: {
    back(ctx, g) {
      ctx.beginPath(); ctx.moveTo(-9, g.shoulderY - 4.8); ctx.lineTo(-5.4, g.shoulderY - 1.4); ctx.strokeStyle = "#241a12"; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-5.4, g.shoulderY - 1.4); ctx.lineTo(8.2, g.hipY + 1.4); ctx.strokeStyle = "#14161b"; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(7.4, g.hipY + 1.2); ctx.lineTo(8.6, g.hipY + 1.6); ctx.strokeStyle = g.A(0.95); ctx.lineWidth = 1; ctx.stroke();
    },
  },
  cutlass: {
    front(ctx, g) {
      const ex = -10 * g.wide + g.fl * 0.6;
      ctx.beginPath(); ctx.moveTo(5, g.hipY - 3.4); ctx.quadraticCurveTo(-3, g.hipY + 6.4, ex, g.hipY + 2.6);
      ctx.strokeStyle = "#1a1418"; ctx.lineWidth = 1.7; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex + 1, g.hipY + 2.9); ctx.lineTo(ex - 0.4, g.hipY + 2.5); ctx.strokeStyle = g.A(0.95); ctx.lineWidth = 0.9; ctx.stroke();
      ctx.beginPath(); ctx.arc(5.6, g.hipY - 3.2, 1.9, 3.4, 5.6); ctx.strokeStyle = g.A(0.95); ctx.lineWidth = 0.7; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(5.2, g.hipY - 3.4); ctx.lineTo(7.6, g.hipY - 4.4); ctx.strokeStyle = "#0a0a0d"; ctx.lineWidth = 2; ctx.stroke();
    },
  },
  boombox: {
    back(ctx, g) {
      ctx.fillStyle = "#17171f"; ctx.fillRect(-10, g.shoulderY + 1.6, 7, 6.6);
      ctx.strokeStyle = g.A(0.85); ctx.lineWidth = 0.6; ctx.strokeRect(-10, g.shoulderY + 1.6, 7, 6.6);
      const pulse = 0.5 + 0.5 * Math.sin(g.now / 120);
      ctx.beginPath(); ctx.arc(-6.5, g.shoulderY + 5.3, 2 + pulse * 0.4, 0, TAU); ctx.strokeStyle = g.A(0.9); ctx.stroke();
      ctx.fillStyle = g.A(0.8); ctx.beginPath(); ctx.arc(-6.5, g.shoulderY + 5.3, 0.7, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-9, g.shoulderY + 1.6); ctx.lineTo(-11.6, g.shoulderY - 4); ctx.strokeStyle = "#8a8c96"; ctx.lineWidth = 0.5; ctx.stroke();
    },
  },
  greatsword: {
    back(ctx, g) {
      ctx.beginPath(); ctx.moveTo(-5.4, g.hipY + 2); ctx.lineTo(-3.4, g.shoulderY - 12); ctx.strokeStyle = "#20232d"; ctx.lineWidth = 1.7; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-6.8, g.shoulderY - 6.8); ctx.lineTo(-0.4, g.shoulderY - 7.6); ctx.strokeStyle = g.A(0.95); ctx.lineWidth = 0.9; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-3.7, g.shoulderY - 12); ctx.lineTo(-3.4, g.shoulderY - 14.4); ctx.strokeStyle = "#0a0a0e"; ctx.lineWidth = 2; ctx.stroke();
    },
  },
  ninjato: {
    back(ctx, g) {
      ctx.beginPath(); ctx.moveTo(-8, g.hipY + 2.2); ctx.lineTo(4.2, g.shoulderY - 9); ctx.strokeStyle = "#171921"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(3.4, g.shoulderY - 8.2); ctx.lineTo(5.6, g.shoulderY - 10.6); ctx.strokeStyle = "#08090d"; ctx.lineWidth = 1.9; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2.6, g.shoulderY - 10.4); ctx.lineTo(5.2, g.shoulderY - 7.8); ctx.strokeStyle = g.A(0.95); ctx.lineWidth = 0.8; ctx.stroke();
    },
  },
  ring: {
    back(ctx, g) {
      // кольцо с тремя барабанами
      const cx = -3, cy = g.shoulderY + 1;
      ctx.beginPath(); ctx.arc(cx, cy, 11, 0, TAU); ctx.strokeStyle = g.A(0.8); ctx.lineWidth = 1.2; ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = 2.2 + i * 0.9 + g.now / 4000;
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 11, cy + Math.sin(a) * 11, 2, 0, TAU);
        ctx.fillStyle = "#1a0a0c"; ctx.fill(); ctx.strokeStyle = g.A(0.95); ctx.lineWidth = 0.6; ctx.stroke();
      }
    },
  },
  tail: {
    back(ctx, g) {
      const w = Math.sin(g.now / 260) * 3 + g.fl * 0.6;
      ctx.beginPath(); ctx.moveTo(-3, g.hipY - 1); ctx.bezierCurveTo(-12 + w, g.hipY + 2, -13 + w * 1.4, g.hipY - 8, -9 + w * 1.8, g.hipY - 14);
      ctx.strokeStyle = "#121219"; ctx.lineWidth = 2.6; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-10.4 + w * 1.6, g.hipY - 10.4); ctx.lineTo(-9 + w * 1.8, g.hipY - 14); ctx.strokeStyle = g.A(0.95); ctx.lineWidth = 2.2; ctx.stroke();
    },
  },
  staff: {
    back(ctx, g) {
      const top = g.shoulderY - 15;
      ctx.beginPath(); ctx.moveTo(-9 * g.wide, g.hemY + 5); ctx.lineTo(-6.6, top); ctx.strokeStyle = "#2a2018"; ctx.lineWidth = 1.2; ctx.stroke();
      const p = 0.6 + 0.4 * Math.sin(g.now / 300);
      if (g.hq) { ctx.fillStyle = g.A(0.22 * p); ctx.beginPath(); ctx.arc(-6.6, top - 1, 4.4, 0, TAU); ctx.fill(); }
      ctx.fillStyle = g.A(0.95); ctx.beginPath(); ctx.arc(-6.6, top - 1, 2, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#3a2c1c"; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(-6.6, top - 1, 2.8, 0.4, 2.7); ctx.stroke();
    },
  },
  shield: {
    back(ctx, g) {
      const cx = -6.4, cy = g.shoulderY + 4.6;
      ctx.beginPath(); ctx.arc(cx, cy, 7, 0, TAU); ctx.fillStyle = "#1c1b20"; ctx.fill();
      ctx.strokeStyle = g.A(0.9); ctx.lineWidth = 0.9; ctx.stroke();
      ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; ctx.moveTo(cx + Math.cos(a) * 6.4, cy + Math.sin(a) * 6.4); ctx.lineTo(cx - Math.cos(a) * 6.4, cy - Math.sin(a) * 6.4); }
      ctx.strokeStyle = g.A(0.28); ctx.lineWidth = 0.5; ctx.stroke();
      ctx.fillStyle = g.A(0.95); ctx.beginPath(); ctx.arc(cx, cy, 1.6, 0, TAU); ctx.fill();
    },
  },
  spear: {
    back(ctx, g) {
      const top = g.shoulderY - 18;
      ctx.beginPath(); ctx.moveTo(-10 * g.wide, g.hemY + 5); ctx.lineTo(-5, top); ctx.strokeStyle = "#2a1c14"; ctx.lineWidth = 1.1; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-5.2, top + 4); ctx.lineTo(-3.4, top + 0.6); ctx.lineTo(-5, top - 3.6); ctx.lineTo(-6.6, top + 0.6); ctx.closePath();
      ctx.fillStyle = "#1b1d24"; ctx.fill(); ctx.strokeStyle = g.A(0.95); ctx.lineWidth = 0.7; ctx.stroke();
    },
  },
  tank: {
    back(ctx, g) {
      for (const dx of [0, 3.8]) {
        ctx.fillStyle = "#1a1d27"; ctx.fillRect(-9.2 + dx, g.shoulderY - 0.6, 3.2, 9.6);
        ctx.strokeStyle = g.A(0.8); ctx.lineWidth = 0.55; ctx.strokeRect(-9.2 + dx, g.shoulderY - 0.6, 3.2, 9.6);
        ctx.fillStyle = g.A(0.95); ctx.fillRect(-9.2 + dx, g.shoulderY + 2.4, 3.2, 0.8);
      }
      ctx.beginPath(); ctx.moveTo(-4, g.shoulderY + 0.4); ctx.quadraticCurveTo(-2, g.shoulderY - 3.4, 0.4, g.shoulderY - 2); ctx.strokeStyle = g.A(0.6); ctx.lineWidth = 0.6; ctx.stroke();
    },
  },
  gear: {
    back(ctx, g) {
      const cx = -5.6, cy = g.shoulderY + 3.4, a0 = g.now / 1500;
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, TAU); ctx.fillStyle = "#1a1d26"; ctx.fill();
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = a0 + i * Math.PI / 4; ctx.moveTo(cx + Math.cos(a) * 4.6, cy + Math.sin(a) * 4.6); ctx.lineTo(cx + Math.cos(a) * 7.2, cy + Math.sin(a) * 7.2); }
      ctx.strokeStyle = "#1a1d26"; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, TAU); ctx.strokeStyle = g.A(0.85); ctx.lineWidth = 0.6; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, TAU); ctx.fillStyle = g.A(0.95); ctx.fill();
    },
  },
  jet: {
    back(ctx, g) {
      for (const dy of [0, 4.8]) {
        ctx.fillStyle = "#1b1e28"; ctx.fillRect(-10, g.shoulderY + 0.8 + dy, 6, 3.6);
        ctx.strokeStyle = g.A(0.85); ctx.lineWidth = 0.55; ctx.strokeRect(-10, g.shoulderY + 0.8 + dy, 6, 3.6);
        const f = 3.4 + Math.sin(g.now / 55 + dy) * 1.2;
        ctx.beginPath(); ctx.moveTo(-10, g.shoulderY + 1.2 + dy); ctx.lineTo(-10 - f, g.shoulderY + 2.6 + dy); ctx.lineTo(-10, g.shoulderY + 4 + dy); ctx.closePath();
        ctx.fillStyle = g.A(0.8); ctx.fill();
      }
    },
  },
  hose: {
    back(ctx, g) {
      ctx.beginPath(); ctx.moveTo(-3, g.shoulderY - 0.4);
      ctx.bezierCurveTo(-14 + g.fl * 0.4, g.shoulderY - 6, -15 + g.fl * 0.6, hipLoop(g), -6, g.hipY + 3);
      ctx.strokeStyle = "#1b1812"; ctx.lineWidth = 1.7; ctx.stroke();
      ctx.strokeStyle = g.A(0.5); ctx.lineWidth = 0.5; ctx.stroke();
      ctx.fillStyle = g.A(0.95); ctx.fillRect(-4, g.shoulderY - 1.6, 2, 2.4); ctx.fillRect(-7, g.hipY + 2, 2.2, 2);
    },
  },
  satchel: {
    front(ctx, g) {
      ctx.fillStyle = "#16150f"; ctx.fillRect(-8.4 * g.wide + g.fl * 0.4, g.hipY - 3.4, 5.8, 5.2);
      ctx.strokeStyle = g.A(0.7); ctx.lineWidth = 0.6; ctx.strokeRect(-8.4 * g.wide + g.fl * 0.4, g.hipY - 3.4, 5.8, 5.2);
      ctx.fillStyle = g.A(0.95); ctx.fillRect(-6.2 * g.wide + g.fl * 0.4, g.hipY - 1.2, 1.4, 1.2);
    },
  },
  cleaver: {
    back(ctx, g) {
      ctx.save(); ctx.translate(-7, g.shoulderY - 1); ctx.rotate(-0.95);
      ctx.fillStyle = "#2a1a12"; ctx.fillRect(-1, -7.2, 1.8, 6);
      ctx.beginPath(); ctx.moveTo(-3.8, -1.4); ctx.lineTo(5.4, -1.4); ctx.lineTo(5.4, 8); ctx.lineTo(-3.8, 8); ctx.closePath();
      ctx.fillStyle = "#1d1f26"; ctx.fill(); ctx.strokeStyle = g.A(0.9); ctx.lineWidth = 0.7; ctx.stroke();
      ctx.beginPath(); ctx.arc(0.8, 1.8, 0.8, 0, TAU); ctx.fillStyle = "#05030a"; ctx.fill();
      ctx.restore();
    },
  },
};
function hipLoop(g) { return g.hipY - 3; }

/* ---------- знаки на груди (кроме базовых rune/sash/moon/bolt/petals/eyes) ---------- */
const MARK_PARTS = {
  orb(ctx, g) {
    // комок света у груди: свет от головы ложится на плечи, воротник и грудь
    const br = 0.5 + 0.5 * Math.sin(g.now / 1100 + 1.2), x = 3.6, y = g.shoulderY + 6.2;
    ctx.fillStyle = "rgba(255,255,255,.1)";
    ctx.beginPath(); ctx.ellipse(0.8, g.shoulderY + 1.4, 6.4 * g.wide, 3.4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.14)";
    ctx.beginPath(); ctx.ellipse(1.6, g.shoulderY + 4.6, 5, 4.2, 0, 0, TAU); ctx.fill();
    for (const q of LUMEN_ORB) { ctx.fillStyle = rgba("#ffffff", Math.round(q[1] * (0.9 + 0.1 * br) * 50) / 50); ctx.beginPath(); ctx.arc(x, y, q[0] * (0.96 + 0.06 * br), 0, TAU); ctx.fill(); }
    ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(x, y, 1.9, 0, TAU); ctx.fill();
  },
  poncho(ctx, g) {
    ctx.lineWidth = 1; ctx.strokeStyle = g.A(0.85);
    ctx.beginPath(); ctx.moveTo(-3.4 * g.wide, g.shoulderY + 4.4);
    for (let i = 0; i < 6; i++) ctx.lineTo(-3.4 * g.wide + (i + 1) * 1.3 * g.wide, g.shoulderY + (i % 2 ? 4.4 : 6.2));
    ctx.stroke();
  },
  lapel(ctx, g) {
    ctx.lineWidth = 0.8; ctx.strokeStyle = g.A(0.7);
    ctx.beginPath(); ctx.moveTo(-1.8, g.shoulderY + 0.4); ctx.lineTo(0.6, g.shoulderY + 6.6); ctx.lineTo(2.6, g.shoulderY + 0.6); ctx.stroke();
    ctx.fillStyle = g.A(0.9); _poly(ctx, [0.2, g.shoulderY + 1.6, 1.2, g.shoulderY + 1.6, 1.6, g.shoulderY + 5, 0.6, g.shoulderY + 6.2]); ctx.fill();
  },
  bones(ctx, g) {
    const x = 0.6, y = g.shoulderY + 5; ctx.lineWidth = 0.9; ctx.strokeStyle = g.A(0.9);
    ctx.beginPath(); ctx.moveTo(x - 2.4, y - 1.4); ctx.lineTo(x + 2.4, y + 2.2); ctx.moveTo(x + 2.4, y - 1.4); ctx.lineTo(x - 2.4, y + 2.2); ctx.stroke();
    ctx.fillStyle = g.A(0.95); ctx.beginPath(); ctx.arc(x, y - 2.2, 1.3, 0, TAU); ctx.fill();
  },
  belt(ctx, g) {
    ctx.lineWidth = 1.7; ctx.strokeStyle = g.A(0.9);
    ctx.beginPath(); ctx.moveTo(-5 * g.wide, g.hipY - 2.6); ctx.lineTo(5.2 * g.wide, g.hipY - 2.8); ctx.stroke();
    ctx.fillStyle = g.A(0.95); ctx.beginPath(); ctx.ellipse(0.6, g.hipY - 2.7, 2.4, 1.8, 0, 0, TAU); ctx.fill();
  },
  studs(ctx, g) {
    ctx.lineWidth = 0.6; ctx.strokeStyle = g.A(0.8);
    ctx.beginPath(); ctx.moveTo(-1.4, g.shoulderY + 1); ctx.lineTo(-2.2, g.hipY - 3.4); ctx.stroke();
    ctx.fillStyle = g.A(0.95);
    for (const [x, y] of [[1.6, 2.2], [3, 3.6], [2.2, 6]]) { ctx.beginPath(); ctx.arc(x, g.shoulderY + y, 0.55, 0, TAU); ctx.fill(); }
  },
  cross(ctx, g) {
    ctx.lineWidth = 1.2; ctx.strokeStyle = g.A(0.9);
    ctx.beginPath(); ctx.moveTo(0.8, g.shoulderY + 1.8); ctx.lineTo(0.8, g.shoulderY + 8.2); ctx.moveTo(-1.8, g.shoulderY + 4); ctx.lineTo(3.4, g.shoulderY + 4); ctx.stroke();
  },
  wraps(ctx, g) {
    ctx.lineWidth = 0.7; ctx.strokeStyle = g.A(0.75);
    ctx.beginPath(); for (let i = 0; i < 3; i++) { ctx.moveTo(-2.4, g.shoulderY + 1.4 + i * 2.4); ctx.lineTo(3, g.shoulderY + 3.2 + i * 2.4); } ctx.stroke();
  },
  tomoe(ctx, g) {
    ctx.fillStyle = g.A(0.9);
    for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; ctx.beginPath(); ctx.arc(0.8 + Math.cos(a) * 1.9, g.shoulderY + 5 + Math.sin(a) * 1.9, 0.85, 0, TAU); ctx.fill(); }
  },
  paw(ctx, g) {
    ctx.fillStyle = g.A(0.85); const y = g.shoulderY + 6.4;
    ctx.beginPath(); ctx.ellipse(0.6, y, 1.9, 1.5, 0, 0, TAU); ctx.fill();
    for (const [x, dy] of [[-1.8, -2.2], [-0.2, -3.2], [1.6, -3.2], [3.2, -2.2]]) { ctx.beginPath(); ctx.arc(0.6 + x * 0.8, y + dy * 0.9, 0.7, 0, TAU); ctx.fill(); }
  },
  diamond(ctx, g) {
    ctx.lineWidth = 0.7; ctx.strokeStyle = g.A(0.85);
    for (const [x, y] of [[0.6, g.shoulderY + 4.6], [0.6, g.shoulderY + 8.8]]) { _poly(ctx, [x, y - 2, x + 2, y, x, y + 2, x - 2, y]); ctx.stroke(); }
    _poly(ctx, [0.6, g.shoulderY + 2.6, 2.6, g.shoulderY + 4.6, 0.6, g.shoulderY + 6.6, -1.4, g.shoulderY + 4.6]); ctx.fillStyle = g.A(0.5); ctx.fill();
  },
  stars(ctx, g) {
    ctx.fillStyle = g.A(0.9);
    for (const [x, y, r] of [[0.4, 2.8, 1], [2.4, 5.6, 0.7], [-1.2, 7.2, 0.8]]) { const yy = g.shoulderY + y; _poly(ctx, [x, yy - r * 1.6, x + r * 0.5, yy - r * 0.5, x + r * 1.6, yy, x + r * 0.5, yy + r * 0.5, x, yy + r * 1.6, x - r * 0.5, yy + r * 0.5, x - r * 1.6, yy, x - r * 0.5, yy - r * 0.5]); ctx.fill(); }
  },
  algiz(ctx, g) {
    ctx.lineWidth = 0.9; ctx.strokeStyle = g.A(0.9);
    ctx.beginPath(); ctx.moveTo(0.8, g.shoulderY + 8.4); ctx.lineTo(0.8, g.shoulderY + 2); ctx.moveTo(-1.6, g.shoulderY + 4.4); ctx.lineTo(0.8, g.shoulderY + 6); ctx.lineTo(3.2, g.shoulderY + 4.4); ctx.stroke();
  },
  lambda(ctx, g) {
    ctx.lineWidth = 1.1; ctx.strokeStyle = g.A(0.95);
    ctx.beginPath(); ctx.moveTo(-1.4, g.shoulderY + 8); ctx.lineTo(0.8, g.shoulderY + 2.6); ctx.lineTo(3, g.shoulderY + 8); ctx.moveTo(-0.2, g.shoulderY + 6.2); ctx.lineTo(1.8, g.shoulderY + 6.2); ctx.stroke();
  },
  usekh(ctx, g) {
    ctx.lineWidth = 1.1;
    for (const [r, a] of [[3.4, 0.95], [5.2, 0.7]]) { ctx.strokeStyle = g.A(a); ctx.beginPath(); ctx.arc(0.8, g.shoulderY - 0.6, r, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
    ctx.fillStyle = g.A(0.95); ctx.beginPath(); ctx.arc(0.8, g.shoulderY + 4.8, 0.8, 0, TAU); ctx.fill();
  },
  patch(ctx, g) {
    ctx.lineWidth = 0.7; ctx.strokeStyle = g.A(0.9);
    ctx.beginPath(); ctx.arc(2, g.shoulderY + 3.6, 1.9, 0, TAU); ctx.stroke();
    ctx.fillStyle = g.A(0.8); ctx.fillRect(-2.4, g.shoulderY + 6.8, 4.6, 1.1);
  },
  panel(ctx, g) {
    ctx.fillStyle = g.A(0.8);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) ctx.fillRect(-1.4 + j * 2.4, g.shoulderY + 2.2 + i * 2, 1.5, 1);
  },
  chev(ctx, g) {
    ctx.lineWidth = 1; ctx.strokeStyle = g.A(0.9);
    for (let i = 0; i < 2; i++) { const y = g.shoulderY + 3 + i * 2.6; ctx.beginPath(); ctx.moveTo(-1.4, y); ctx.lineTo(0.8, y + 1.6); ctx.lineTo(3, y); ctx.stroke(); }
  },
  gauge(ctx, g) {
    ctx.lineWidth = 0.8; ctx.strokeStyle = g.A(0.95);
    ctx.beginPath(); ctx.arc(0.8, g.shoulderY + 5, 2.4, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.8, g.shoulderY + 5); ctx.lineTo(1.9 + Math.sin(g.now / 700) * 0.4, g.shoulderY + 3.4); ctx.stroke();
  },
  vials(ctx, g) {
    ctx.fillStyle = g.A(0.8);
    for (let i = 0; i < 3; i++) { ctx.fillRect(-2.6 + i * 2.4, g.hipY - 7.6, 1.2, 3); }
    ctx.strokeStyle = "#1c1b14"; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-3, g.hipY - 7.8); ctx.lineTo(4, g.hipY - 7.8); ctx.stroke();
  },
  stitch(ctx, g) {
    ctx.lineWidth = 0.7; ctx.strokeStyle = g.A(0.85);
    ctx.beginPath(); ctx.moveTo(-1.8, g.shoulderY + 2); ctx.lineTo(2.4, g.shoulderY + 8);
    for (let i = 0; i < 4; i++) { const t = 0.15 + i * 0.22, x = -1.8 + 4.2 * t, y = g.shoulderY + 2 + 6 * t; ctx.moveTo(x - 1, y + 0.8); ctx.lineTo(x + 1, y - 0.8); }
    ctx.stroke();
  },
  brooch(ctx, g) {
    ctx.fillStyle = g.A(0.95); ctx.beginPath(); ctx.arc(0.8, g.shoulderY + 1.6, 1.3, 0, TAU); ctx.fill();
    ctx.strokeStyle = g.A(0.6); ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(0.8, g.shoulderY + 2.9); ctx.quadraticCurveTo(0.2, g.shoulderY + 6, 0.8, g.hipY - 3); ctx.stroke();
  },
};

/* ---------- подолы плаща: от правого угла (xr) к левому (xl) на высоте y ---------- */
const HEM_PARTS = {
  fringe(ctx, xr, xl, y) { for (let i = 0; i < 9; i++) { ctx.lineTo(lerp(xr, xl, (i + 0.5) / 9), y + 2.6); ctx.lineTo(lerp(xr, xl, (i + 1) / 9), y + 0.2); } },
  robe(ctx, xr, xl, y) { ctx.lineTo(lerp(xr, xl, 0.2), y + 2); ctx.lineTo(lerp(xr, xl, 0.5), y + 3.4); ctx.lineTo(lerp(xr, xl, 0.8), y + 2); ctx.lineTo(xl, y + 1); },
  bat(ctx, xr, xl, y) {
    ctx.lineTo(lerp(xr, xl, 0.08), y + 5.6);
    ctx.quadraticCurveTo(lerp(xr, xl, 0.24), y + 1.2, lerp(xr, xl, 0.4), y + 6);
    ctx.quadraticCurveTo(lerp(xr, xl, 0.58), y + 1.2, lerp(xr, xl, 0.72), y + 5.6);
    ctx.quadraticCurveTo(lerp(xr, xl, 0.88), y + 1.4, xl, y + 3.4);
  },
  kilt(ctx, xr, xl, y) { ctx.lineTo(lerp(xr, xl, 0.04), y + 2.8); ctx.lineTo(lerp(xr, xl, 0.34), y + 2.8); ctx.lineTo(lerp(xr, xl, 0.5), y + 1.4); ctx.lineTo(lerp(xr, xl, 0.66), y + 2.8); ctx.lineTo(xl, y + 2.8); },
  points(ctx, xr, xl, y) { for (let i = 0; i < 4; i++) { ctx.lineTo(lerp(xr, xl, (i + 0.5) / 4), y + 5.2); ctx.lineTo(lerp(xr, xl, (i + 1) / 4), y + 0.4); } },
  fur(ctx, xr, xl, y) { for (let i = 0; i < 7; i++) { ctx.lineTo(lerp(xr, xl, (i + 0.45) / 7), y + 1.4 + (i * 5 % 3) * 0.9); ctx.lineTo(lerp(xr, xl, (i + 1) / 7), y + 0.2); } },
};
