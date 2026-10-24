// Контактный лист всех скинов: node tools/skins-sheet.js [файл.png] [масштаб]
// Две строки на скин: стойка (как в «Облике») и бег с замахом клинком. Ошибки страницы печатаются.
const { chromium } = require(process.env.PW || "playwright");
const path = require("path"), fs = require("fs");
const out = process.argv[2] || path.join(__dirname, "../.shots/skins-all.png");
const scaleArg = +(process.argv[3] || 3.4), only = process.argv[4] ? process.argv[4].split(",") : null, colsArg = +(process.argv[5] || 9);
fs.mkdirSync(path.dirname(out), { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message + "\n" + e.stack));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  const data = await page.evaluate(([sc, only, colsArg]) => {
    const ids = Object.keys(SKINS_REF).filter(k => !only || only.includes(k)), cols = colsArg, cell = Math.round(sc * 55), rows = Math.ceil(ids.length / cols);
    const cv = document.createElement("canvas");
    cv.width = cols * cell; cv.height = rows * cell * 2 + 0;
    const c = cv.getContext("2d");
    const poses = [
      { armF: 0.5, elbowF: 0.5, lean: 0.05 },
      { armF: 1.5, elbowF: 0.2, lean: 0.25, legAmp: 1, legPhase: 1.2, wAngle: -0.2, wBlend: 0.6, cloak: -0.5 },
    ];
    ids.forEach((id, i) => {
      const sk = SKINS_REF[id], col = i % cols, row = Math.floor(i / cols);
      poses.forEach((pose, pi) => {
        const x0 = col * cell, y0 = (row * 2 + pi) * cell;
        c.save(); c.beginPath(); c.rect(x0, y0, cell, cell); c.clip();
        c.fillStyle = "#0d0e14"; c.fillRect(x0, y0, cell, cell);
        c.fillStyle = "rgba(255,255,255,.12)"; c.fillRect(x0, y0 + cell * 0.84, cell, 1);
        const ch = { kind: "player", skin: sk, x: x0 + cell / 2, y: y0 + cell * 0.84, facing: 1, scale: sc, anim: new AnimStateRef(), scarfColor: sk.scarf, weapon: "dagger", eyeBoost: pi ? 0.8 : 0.3, flash: 0, groundY: y0 + cell * 0.84, vx: 0, vy: 0 };
        Object.assign(ch.anim.pose, pose);
        if (pi) ch.anim.cloak = -0.6;
        CharacterRendererRef.draw(c, ch);
        c.restore();
        if (!pi) { c.fillStyle = "#cfd3e0"; c.font = "12px sans-serif"; c.fillText(sk.name + " · " + sk.cat, x0 + 6, y0 + 14); }
      });
    });
    return { url: cv.toDataURL("image/png"), n: ids.length };
  }, [scaleArg, only, colsArg]);
  fs.writeFileSync(out, Buffer.from(data.url.split(",")[1], "base64"));
  console.log("скинов:", data.n, "->", out);
  console.log(errors.length ? "ОШИБКИ:\n" + errors.join("\n") : "без ошибок");
  await browser.close();
})();
