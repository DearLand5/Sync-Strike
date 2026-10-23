// Иконка приложения из графики игры (герой «Тень»): node tools/make-icon.js <out.png>
const { chromium } = require(process.env.PW || "playwright");
const path = require("path"), fs = require("fs");
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto("file://" + path.join(__dirname, "../index.html")); await p.waitForTimeout(500);
  const data = await p.evaluate(() => {
    const S = 512, cv = document.createElement("canvas"); cv.width = cv.height = S;
    const c = cv.getContext("2d");
    const g = c.createRadialGradient(S / 2, S * 0.42, 20, S / 2, S * 0.5, S * 0.7);
    g.addColorStop(0, "#1a1440"); g.addColorStop(1, "#05060b");
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    // неоновое кольцо доли и линия пола
    c.strokeStyle = "rgba(62,240,255,.9)"; c.lineWidth = 10;
    c.beginPath(); c.arc(S / 2, S * 0.5, S * 0.36, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = "rgba(255,46,136,.8)"; c.lineWidth = 6;
    c.beginPath(); c.arc(S / 2, S * 0.5, S * 0.41, -0.9, 0.9); c.stroke();
    c.beginPath(); c.arc(S / 2, S * 0.5, S * 0.41, Math.PI - 0.9, Math.PI + 0.9); c.stroke();
    const skin = SKINS_REF.shade;
    const ch = { kind: "player", skin, x: S / 2 - 6, y: S * 0.8, facing: 1, scale: 8.2, anim: new AnimStateRef(), scarfColor: null, weapon: "dagger", eyeBoost: 0.6, flash: 0, groundY: S * 0.8, vx: 0, vy: 0 };
    Object.assign(ch.anim.pose, { armF: 1.9, elbowF: 0.2, lean: 0.12, armB: -0.6 });
    CharacterRendererRef.draw(c, ch);
    return cv.toDataURL("image/png");
  });
  fs.writeFileSync(process.argv[2], Buffer.from(data.split(",")[1], "base64"));
  await b.close();
})();
