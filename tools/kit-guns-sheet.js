// Лист кадров анимаций выстрелов «Ржавого обреза» и «Тяжёлого револьвера» (12k_c_guns): node tools/kit-guns-sheet.js [файл.png] [масштаб]
// Строка — приём, колонки — подготовка, выстрел, отдача, восстановление. Приёмы: базовые ranged + свои комбинации набора.
const { chromium } = require(process.env.PW || "playwright");
const path = require("path"), fs = require("fs");
const out = process.argv[2] || path.join(__dirname, "../.shots/kit-guns-sheet.png");
const sc = +(process.argv[3] || 3);
fs.mkdirSync(path.dirname(out), { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message + "\n" + e.stack));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  const only = process.argv[4] ? process.argv[4].split(",") : null, nm0 = process.argv[5] ? process.argv[5].split(",") : null;
  const url = await page.evaluate(([sc, only, nm0]) => {
    const g = window.__game, cs = g.combat, SK = window.SKINS_REF.shade;
    const base = ["shot", "hip", "twin", "backShot", "charged", "fan"];
    let rows = [["sawed", base.concat(["duplet", "buttstock"])], ["revolver", base.concat(["fanning", "ricochet", "shot*"])]];
    if (only) rows = rows.filter(r => only.includes(r[0]));
    if (nm0) rows = rows.map(r => [r[0], r[1].filter(n => nm0.includes(n))]);
    const cell = Math.round(62 * sc), cols = 8, nrow = rows.reduce((s, r) => s + r[1].length, 0);
    const cv = document.createElement("canvas"); cv.width = cols * cell; cv.height = nrow * cell;
    const c = cv.getContext("2d");
    let row = 0;
    for (const [wid, names] of rows) {
      g.settings.v.gunWeapon = wid;
      for (const nm of names) {
        const series = nm.endsWith("*"), name = series ? nm.slice(0, -1) : nm;
        const def = window.weaponDefRef(name, g.settings.v);
        const half = 0.25, extra = series ? 0.14 : 0;
        const own = name === "duplet" || name === "buttstock";
        const startup = def.startup, active = own ? half + 0.06 : name === "fanning" ? 0.26 : def.active, rec = def.recovery + extra;
        const tA = startup, aEnd = startup + active;
        let times = [startup * 0.7, tA + 0.005, tA + 0.045, aEnd + rec * 0.12, aEnd + rec * 0.3, aEnd + rec * 0.5, aEnd + rec * 0.72, aEnd + rec * 0.92];
        if (own) times = [startup * 0.7, tA + 0.01, tA + half * 0.5, tA + half + 0.01, tA + half + 0.05, aEnd + rec * 0.2, aEnd + rec * 0.5, aEnd + rec * 0.8];
        if (name === "fanning") times = [0.03, 0.07, 0.11, 0.15, 0.2, 0.27, aEnd + rec * 0.4, aEnd + rec * 0.8];
        times.forEach((t, ci) => {
          const x0 = ci * cell, y0 = row * cell, gy = y0 + cell * 0.82;
          const ch = { kind: "player", skin: SK, x: x0 + cell * 0.38, y: gy, facing: 1, scale: sc, anim: new window.AnimStateRef(), scarfColor: SK.scarf, weapon: wid, eyeBoost: 0.4, flash: 0, groundY: gy, vx: 0, vy: 0, onGround: true, pistolT: 1, w: 12, h: 30, centerY: gy - 16 };
          const tg = { x: ch.x + 150, centerY: gy - 16, targetable: true };
          const act = { name, def, t, phase: t < startup ? "startup" : t < aEnd ? "active" : "recovery", startup, travel: 0, active, recovery: rec, dir: 1, target: tg, style: null, judge: { rating: "perfect", period: 0.5 } };
          if (series || name === "fanning") act.kSeries = true;
          if (own) { act.kHalf = half; if (t >= tA + half) { act.kDone = true; act.kLast = tA + half; } else if (name === "duplet") act.kLast = tA; }
          if (name === "ricochet" && t >= tA) { act.kShot = true; act.kLast = tA; }
          if (name === "fanning" && t >= 0.06) act.kLast = 0.06 + Math.floor((t - 0.06) / 0.045) * 0.045;
          const P = cs.actionPose(ch, act);
          Object.assign(ch.anim.pose, window.BASE_POSE_REF, P);
          ch.anim.cloak = P.cloak || 0;
          c.save(); c.beginPath(); c.rect(x0, y0, cell, cell); c.clip();
          c.fillStyle = "#0d0e14"; c.fillRect(x0, y0, cell, cell);
          c.fillStyle = "rgba(255,255,255,.12)"; c.fillRect(x0, gy, cell, 1);
          window.CharacterRendererRef.draw(c, ch);
          c.restore();
          c.fillStyle = "#cfd3e0"; c.font = "10px sans-serif";
          c.fillText((ci ? "" : wid + " " + nm + " ") + t.toFixed(2) + "с " + act.phase, x0 + 4, y0 + 12);
        });
        row++;
      }
    }
    return cv.toDataURL("image/png");
  }, [sc, only, nm0]);
  fs.writeFileSync(out, Buffer.from(url.split(",")[1], "base64"));
  console.log("->", out);
  console.log(errors.length ? "ОШИБКИ:\n" + errors.join("\n") : "без ошибок");
  await browser.close();
})();
