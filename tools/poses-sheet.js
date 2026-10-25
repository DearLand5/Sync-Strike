// Контактный лист пафосных поз: node tools/poses-sheet.js [файл.png] [скин]
// Строка на позу: кадры по ходу до акцента (k) и после (r). Ошибки страницы печатаются.
const { chromium } = require(process.env.PW || "playwright");
const path = require("path"), fs = require("fs");
const out = process.argv[2] || path.join(__dirname, "../.shots/poses.png");
const skinId = process.argv[3] || "shade";
fs.mkdirSync(path.dirname(out), { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message + "\n" + e.stack));
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  const url = await page.evaluate(skinId => {
    const ids = Object.keys(POSES_REF), frames = [[0, 0], [0.25, 0], [0.45, 0], [0.6, 0], [0.75, 0], [0.9, 0], [1, 0], [1, 0.5], [1, 1]];
    const sc = 3, cell = 165, cv = document.createElement("canvas");
    cv.width = frames.length * cell; cv.height = ids.length * cell;
    const c = cv.getContext("2d"), sk = SKINS_REF[skinId];
    ids.forEach((id, row) => frames.forEach(([k, r], col) => {
      const x0 = col * cell, y0 = row * cell, gy = y0 + cell * 0.86;
      c.save(); c.beginPath(); c.rect(x0, y0, cell, cell); c.clip();
      c.fillStyle = "#0d0e14"; c.fillRect(x0, y0, cell, cell);
      c.fillStyle = "rgba(255,255,255,.12)"; c.fillRect(x0, gy, cell, 1);
      const ch = { kind: "player", skin: sk, x: x0 + cell / 2, y: gy, facing: 1, scale: sc, anim: new AnimStateRef(), scarfColor: sk.scarf, weapon: "dagger", eyeBoost: 0.3, flash: 0, groundY: gy, vx: 0, vy: 0, pistolT: 0, poseAct: { face: 1 } };
      const P = POSES_REF[id].pose(k, r, ch);
      Object.assign(ch.anim.pose, BASE_POSE_REF, P);
      ch.anim.cloak = P.cloak || 0;
      ch.weapon = ch.pistolT > 0 ? "pistol" : "dagger";
      if (P.eye) ch.eyeBoost = P.eye;
      CharacterRendererRef.draw(c, ch);
      c.restore();
      c.fillStyle = "#cfd3e0"; c.font = "11px sans-serif";
      c.fillText((col ? "" : POSES_REF[id].name + " ") + (r ? "r " + r : "k " + k), x0 + 5, y0 + 13);
    }));
    return cv.toDataURL("image/png");
  }, skinId);
  fs.writeFileSync(out, Buffer.from(url.split(",")[1], "base64"));
  console.log("->", out);
  console.log(errors.length ? "ОШИБКИ:\n" + errors.join("\n") : "без ошибок");
  await browser.close();
})();
