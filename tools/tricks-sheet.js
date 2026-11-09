// Лист кадров трюков оружия ближнего боя: node tools/tricks-sheet.js [id,id|all] [файл.png] [масштаб]
// Строка на трюк, 8 кадров по ходу трюка (поза без сглаживания — так видна сама форма движения).
const { chromium } = require(process.env.PW || "playwright");
const path = require("path"), fs = require("fs");
const ids = process.argv[2] || "all";
const out = process.argv[3] || path.join(__dirname, "../.shots/tricks.png");
const sc = +(process.argv[4] || 2.4);
fs.mkdirSync(path.dirname(out), { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message + "\n" + e.stack));
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  const url = await page.evaluate(([ids, sc]) => {
    const TR = window.TRICKS_REF, list = ids === "all" ? Object.keys(TR) : ids.split(",");
    const rows = []; for (const id of list) for (const t of TR[id]) rows.push([id, t]);
    const cols = 8, cell = Math.round(sc * 52), cw = Math.round(sc * 70);
    const cv = document.createElement("canvas"); cv.width = cols * cw; cv.height = rows.length * cell;
    const c = cv.getContext("2d"), sk = window.SKINS_REF.shade;
    rows.forEach(([id, def], r) => {
      for (let i = 0; i < cols; i++) {
        const x0 = i * cw, y0 = r * cell, gy = y0 + cell * 0.82;
        const ch = { kind: "player", skin: sk, x: x0 + cw * 0.42, y: gy, facing: 1, scale: sc, anim: new window.AnimStateRef(), scarfColor: sk.scarf, weapon: id, eyeBoost: 0.4, flash: 0, groundY: gy, vx: 0, vy: 0, onGround: true, w: 12, h: 30, wExt: 0 };
        const dur = 1;
        ch.trick = { def, t: dur * (i + 0.5) / cols, dur, seed: 0.5 };
        const P = { bodyY: 0, sx: 1, sy: 1, lean: 0.03, legAmp: 0, legSpread: 1, tuck: 0, armF: 0.25, elbowF: 0.55, armB: -0.25, wBlend: 0, headTilt: 0, cloak: 0 };
        window.trickPoseRef(ch, P, false);
        Object.assign(ch.anim.pose, window.BASE_POSE_REF, P);
        c.save(); c.beginPath(); c.rect(x0, y0, cw, cell); c.clip();
        c.fillStyle = "#0d0e14"; c.fillRect(x0, y0, cw, cell);
        c.fillStyle = "rgba(255,255,255,.12)"; c.fillRect(x0, gy, cw, 1);
        window.CharacterRendererRef.draw(c, ch);
        c.restore();
        if (!i) { c.fillStyle = "#cfd3e0"; c.font = "10px sans-serif"; c.fillText(id + " · " + def.name, x0 + 3, y0 + 11); }
      }
    });
    return cv.toDataURL("image/png");
  }, [ids, sc]);
  fs.writeFileSync(out, Buffer.from(url.split(",")[1], "base64"));
  console.log("лист:", out);
  console.log(errors.length ? "ОШИБКИ:\n" + errors.join("\n") : "без ошибок");
  await browser.close();
})();
