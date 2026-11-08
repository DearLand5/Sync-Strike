// Лист кадров анимаций выстрелов (12k_d_guns): node tools/kit-guns2-sheet.js [оружие=smg|rail|pistol] [файл.png] [масштаб]
// Строка на приём (базовые выстрелы оружия и его комбинации), колонки — фазы: подготовка, выстрел, восстановление.
// Враг — розовая полоса впереди героя (для «Вслепую» — позади, для «Карусели» — с обеих сторон).
const { chromium } = require(process.env.PW || "playwright");
const path = require("path"), fs = require("fs");
const wid = process.argv[2] || "smg", out = process.argv[3] || path.join(__dirname, `../.shots/kit-guns2-${wid}.png`), sc = +(process.argv[4] || 3);
fs.mkdirSync(path.dirname(out), { recursive: true });
const MOVES = {
  smg: ["shot", "hip", "twin", "backShot", "charged", "fan", "smgStorm", "smgCarousel"],
  rail: ["shot", "hip", "twin", "backShot", "charged", "fan", "railBeam", "railButt"],
  pistol: ["shot", "hip", "twin", "backShot", "charged", "fan", "pistolDtap", "pistolBlind"],
}[wid];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message + "\n" + e.stack));
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  const url = await page.evaluate(([wid, MOVES, sc]) => {
    const g = window.__game, cs = g.combat;
    g.settings.v.gunWeapon = wid;
    const phases = [["startup", 0.35], ["startup", 1], ["active", 0.15], ["active", 0.7], ["recovery", 0.25], ["recovery", 0.6], ["recovery", 0.9]];
    const cell = Math.round(sc * 70), cols = phases.length, cv = document.createElement("canvas");
    cv.width = cols * cell; cv.height = MOVES.length * cell;
    const c = cv.getContext("2d"), sk = window.SKINS_REF.shade;
    MOVES.forEach((name, row) => {
      const def = window.weaponDefRef(name, g.settings.v);
      phases.forEach(([ph, k], col) => {
        const x0 = col * cell, y0 = row * cell, gy = y0 + cell * 0.84, hx = x0 + cell * 0.5;
        const ch = { kind: "player", skin: sk, x: hx, y: gy, facing: 1, scale: sc, anim: new window.AnimStateRef(), scarfColor: sk.scarf, weapon: wid, eyeBoost: 0.4, flash: 0, groundY: gy, vx: 0, vy: 0, onGround: true, pistolT: 1, w: 12, h: 30 };
        const blind = name === "pistolBlind", both = name === "smgCarousel";
        const tx = blind ? -50 : 50;
        // «мир» героя: x=0, y=0; цель относительно него
        const p = { x: 0, y: 0, onGround: true, anim: ch.anim, scale: 1, facing: 1, skin: sk };
        const t = ph === "startup" ? def.startup * k : ph === "active" ? def.startup + def.active * k : def.startup + def.active + def.recovery * k;
        const mid = def.startup + def.active * 0.5;
        const act = { name, def, t, phase: ph, startup: def.startup, travel: 0, active: def.active, recovery: def.recovery, dir: blind ? -1 : 1,
          target: { x: tx, centerY: -16 }, judge: { rating: "perfect", beatTime: 3.0 }, style: null, shotsFired: 99,
          kdFlip: t > mid, kdFlipT: mid, kdTgB: both ? { x: -50, centerY: -16 } : null, kdShot: name === "railButt" && t > def.startup + 0.11, kdShotAt: def.startup + 0.11 };
        const P = cs.actionPose(p, act);
        Object.assign(ch.anim.pose, window.BASE_POSE_REF, P);
        ch.anim.cloak = P.cloak || 0;
        ch.kdCharge = p.kdCharge; ch.kdChargeAt = p.kdChargeAt;
        c.save(); c.beginPath(); c.rect(x0, y0, cell, cell); c.clip();
        c.fillStyle = "#0d0e14"; c.fillRect(x0, y0, cell, cell);
        c.fillStyle = "rgba(255,255,255,.12)"; c.fillRect(x0, gy, cell, 1);
        c.fillStyle = "rgba(255,46,136,.25)";
        c.fillRect(hx + tx * sc - 6 * sc, gy - 30 * sc, 12 * sc, 30 * sc);
        if (both) c.fillRect(hx - 50 * sc - 6 * sc, gy - 30 * sc, 12 * sc, 30 * sc);
        window.CharacterRendererRef.draw(c, ch);
        c.restore();
        c.fillStyle = "#cfd3e0"; c.font = "10px sans-serif";
        c.fillText((col ? "" : def.name + " ") + ph + " " + k, x0 + 4, y0 + 12);
      });
    });
    return cv.toDataURL("image/png");
  }, [wid, MOVES, sc]);
  fs.writeFileSync(out, Buffer.from(url.split(",")[1], "base64"));
  console.log("->", out);
  console.log(errors.length ? "ОШИБКИ:\n" + errors.join("\n") : "без ошибок");
  await browser.close();
})();
