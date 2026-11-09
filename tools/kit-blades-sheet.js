// Лист кадров анимаций клинков (12k_b_blades): node tools/kit-blades-sheet.js [kusari|katana|dagger] [файл.png]
// Строка — приём (базовые + свои комбинации), колонки — фазы: подготовка (0,4 и 1), удар (0,3 и 0,8), доводка (0,25 и 0,75).
const { chromium } = require(process.env.PW || "playwright");
const path = require("path"), fs = require("fs");
const wid = process.argv[2] || "kusari";
const out = process.argv[3] || path.join(__dirname, `../.shots/kit-${wid}.png`);
fs.mkdirSync(path.dirname(out), { recursive: true });
const MOVES = {
  kusari: (process.env.MOVES || "slash1,slash2,slash3,thrust,cross,kusariLash,kusariPendulum,kusariGrab,kusariWrap,kusariWhirl,kusariCrack,kusariReap").split(","),
  katana: ["slash1", "slash2", "slash3", "thrust", "rise", "dash", "cross", "katanaSwallow", "katanaIai", "katanaPetals"],
  dagger: ["slash1", "slash2", "slash3", "thrust", "rise", "dash", "cross", "daggerWhirl", "daggerStep", "daggerKnives"],
}[wid];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message + "\n" + e.stack));
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  const url = await page.evaluate(([wid, moves]) => {
    const g = window.__game, cs = g.combat;
    g.settings.v.meleeWeapon = wid;
    const phases = [["startup", 0.4], ["startup", 1], ["active", 0.3], ["active", 0.8], ["recovery", 0.25], ["recovery", 0.75]];
    const wide = wid === "kusari", sc = wide ? 1.35 : 2.4, cell = wide ? 300 : 175, cellH = wide ? 150 : 175, cv = document.createElement("canvas");
    cv.width = phases.length * cell; cv.height = moves.length * cellH;
    const c = cv.getContext("2d"), sk = window.SKINS_REF.shade;
    moves.forEach((name, row) => {
      const def = window.weaponDefRef(name, g.settings.v);
      phases.forEach(([ph, k], pi) => {
        const x0 = pi * cell, y0 = row * cellH, gy = y0 + cellH * (wide ? 0.8 : 0.82);
        const ch = { kind: "player", skin: sk, x: x0 + cell * (wide ? 0.22 : 0.4), y: gy, facing: 1, scale: sc, anim: new window.AnimStateRef(), scarfColor: sk.scarf, weapon: wid, eyeBoost: 0.4, flash: 0, groundY: gy, vx: 0, vy: 0, onGround: true, wExt: 0, w: 12, h: 30, centerY: gy - 16 };
        const travel = def.kind === "dash" ? 0.12 : name === "katanaIai" ? 0.1 : 0;
        const recovery = name === "katanaIai" ? 0.5 : def.recovery;
        const active = name === "katanaPetals" ? 0.5 : def.active;
        const tA = def.startup + travel;
        const t = ph === "startup" ? def.startup * k : ph === "active" ? tA + active * k : tA + active + recovery * k;
        const act = { name, def, t, phase: ph, startup: def.startup, travel, active, recovery, dir: 1, target: null, judge: { rating: "perfect" } };
        act.arcT = ph === "active" ? k : 0;
        let P = cs.actionPose(ch, act);
        Object.assign(ch.anim.pose, window.BASE_POSE_REF, P);
        P = cs.actionPose(ch, act);          // второй проход: кисть берётся из уже выставленной позы (цепь кусаригамы считается от кисти)
        Object.assign(ch.anim.pose, window.BASE_POSE_REF, P);
        ch.anim.cloak = P.cloak || 0;
        c.save(); c.beginPath(); c.rect(x0, y0, cell, cellH); c.clip();
        c.fillStyle = "#0d0e14"; c.fillRect(x0, y0, cell, cellH);
        c.fillStyle = "rgba(255,255,255,.12)"; c.fillRect(x0, gy, cell, 1);
        window.CharacterRendererRef.draw(c, ch);
        c.restore();
        c.fillStyle = "#cfd3e0"; c.font = "10px sans-serif";
        c.fillText((pi ? "" : name + " ") + ph.slice(0, 3) + " " + k, x0 + 4, y0 + 12);
      });
    });
    return cv.toDataURL("image/png");
  }, [wid, MOVES]);
  fs.writeFileSync(out, Buffer.from(url.split(",")[1], "base64"));
  console.log("->", out);
  // две половины (строки 0–4 и 5–9) — для просмотра без сильного сжатия
  const half = async (a, b, file) => {
    const d = await page.evaluate(async ([src, a, b]) => {
      const im = new Image(); im.src = src; await im.decode();
      const rh = im.height / 10, c = document.createElement("canvas"); c.width = im.width; c.height = rh * (b - a);
      c.getContext("2d").drawImage(im, 0, a * rh, im.width, rh * (b - a), 0, 0, im.width, rh * (b - a));
      return c.toDataURL("image/png");
    }, [url, a, b]);
    fs.writeFileSync(file, Buffer.from(d.split(",")[1], "base64"));
  };
  await half(0, 5, out.replace(".png", "-a.png")); await half(5, 10, out.replace(".png", "-b.png"));
  console.log(errors.length ? "ОШИБКИ:\n" + errors.join("\n") : "без ошибок");
  await browser.close();
})();
