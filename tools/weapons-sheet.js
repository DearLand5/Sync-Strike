// Контактный лист оружия игрока: node tools/weapons-sheet.js [файл.png] [масштаб] [id,id]
// Для каждого оружия — стойка (как на карточке), удар/выстрел и бег с замахом. Ошибки страницы печатаются.
const { chromium } = require(process.env.PW || "playwright");
const path = require("path"), fs = require("fs");
const out = process.argv[2] || path.join(__dirname, "../.shots/weapons-sheet.png");
const sc = +(process.argv[3] || 3.6), only = process.argv[4] ? process.argv[4].split(",") : null;
fs.mkdirSync(path.dirname(out), { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message + "\n" + e.stack));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  const data = await page.evaluate(([sc, only]) => {
    const ids = Object.keys(window.WEAPONS_REF).filter(k => !only || only.includes(k));
    const cell = Math.round(sc * 62), cols = 6, rowsPer = 3, rows = Math.ceil(ids.length / cols);
    const cv = document.createElement("canvas");
    cv.width = cols * cell; cv.height = rows * rowsPer * cell;
    const c = cv.getContext("2d");
    const sk = window.SKINS_REF.shade;
    ids.forEach((id, i) => {
      const w = window.WEAPONS_REF[id], gun = w.slot === "gun", col = i % cols, row = Math.floor(i / cols);
      for (let pi = 0; pi < rowsPer; pi++) {
        const x0 = col * cell, y0 = (row * rowsPer + pi) * cell;
        c.save(); c.beginPath(); c.rect(x0, y0, cell, cell); c.clip(); c.translate(x0, y0);
        if (pi < 2) window.drawWeaponPreviewRef(c, id, sk, cell, pi ? "strike" : "idle");
        else {
          // бег с замахом
          c.fillStyle = "#0d0e14"; c.fillRect(0, 0, cell, cell);
          c.fillStyle = "rgba(255,255,255,.12)"; c.fillRect(0, cell * 0.86, cell, 1);
          const ch = { kind: "player", skin: sk, x: cell * 0.36, y: cell * 0.88, facing: 1, scale: cell / 74, anim: new window.AnimStateRef(), scarfColor: sk.scarf, weapon: id, eyeBoost: 0.8, flash: 0, groundY: cell * 0.86, vx: 0, vy: 0, wExt: id === "kusari" ? 0.7 : 0 };
          Object.assign(ch.anim.pose, gun ? { armF: 1.2, elbowF: 0.2, lean: 0.15, legAmp: 1, legPhase: 1.2, cloak: -0.5 } : { armF: 1.5, elbowF: 0.2, lean: 0.25, legAmp: 1, legPhase: 1.2, wAngle: -0.2, wBlend: 0.0, cloak: -0.5 });
          ch.anim.cloak = -0.6;
          window.CharacterRendererRef.draw(c, ch);
        }
        c.restore();
        if (pi === 0) { c.fillStyle = "#cfd3e0"; c.font = "13px sans-serif"; c.fillText(w.name, x0 + 6, y0 + 16); }
      }
    });
    return cv.toDataURL("image/png");
  }, [sc, only]);
  fs.writeFileSync(out, Buffer.from(data.split(",")[1], "base64"));
  console.log("лист:", out);
  console.log(errors.length ? "ОШИБКИ:\n" + errors.join("\n") : "без ошибок");
  await browser.close();
})();
