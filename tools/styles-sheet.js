// Контактный лист визуальных стилей приёмов (12c_styles): node tools/styles-sheet.js [файл.png]
// Строка на стиль: обычная поза приёма и та же в стиле — в подготовке, ударе и доводке.
const { chromium } = require(process.env.PW || "playwright");
const path = require("path"), fs = require("fs");
const out = process.argv[2] || path.join(__dirname, "../.shots/styles.png");
fs.mkdirSync(path.dirname(out), { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message + "\n" + e.stack));
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  const url = await page.evaluate(() => {
    const g = window.__game, cs = g.combat, A = window.ATTACKS_REF, S = window.STYLES_REF;
    const ids = Object.keys(S), phases = [["startup", 0.7], ["travel", 0.5], ["active", 0.3], ["active", 0.75], ["recovery", 0.4]];
    const sc = 3, cell = 150, cols = phases.length * 2, cv = document.createElement("canvas");
    cv.width = cols * cell; cv.height = ids.length * cell;
    const c = cv.getContext("2d"), sk = window.SKINS_REF.shade;
    ids.forEach((id, row) => {
      const name = S[id].moves[0], def = A[name];
      phases.forEach(([ph, k], pi) => [false, true].forEach((styled, si) => {
        const col = pi * 2 + si, x0 = col * cell, y0 = row * cell, gy = y0 + cell * 0.82;
        const ch = { kind: "player", skin: sk, x: x0 + cell / 2, y: gy, facing: 1, scale: sc, anim: new window.AnimStateRef(), scarfColor: sk.scarf, weapon: def.kind === "ranged" ? "pistol" : "dagger", eyeBoost: 0.4, flash: 0, groundY: gy, vx: 0, vy: 0, onGround: true, pistolT: def.kind === "ranged" ? 1 : 0, w: 12, h: 30, centerY: gy - 16 };
        const travel = def.kind === "dash" ? 0.12 : 0;
        const tA = def.startup + travel;
        const t = ph === "startup" ? def.startup * k : ph === "travel" ? def.startup + travel * k : ph === "active" ? tA + def.active * k : tA + def.active + def.recovery * k;
        const act = { name, def, t, phase: ph === "travel" && !travel ? "startup" : ph, startup: def.startup, travel, active: def.active, recovery: def.recovery, dir: 1, target: null, style: styled ? id : null, judge: { rating: "perfect" } };
        const P = cs.actionPose(ch, act);
        Object.assign(ch.anim.pose, window.BASE_POSE_REF, P);
        ch.anim.cloak = P.cloak || 0;
        c.save(); c.beginPath(); c.rect(x0, y0, cell, cell); c.clip();
        c.fillStyle = styled ? "#11121a" : "#0d0e14"; c.fillRect(x0, y0, cell, cell);
        c.fillStyle = "rgba(255,255,255,.12)"; c.fillRect(x0, gy, cell, 1);
        window.CharacterRendererRef.draw(c, ch);
        c.restore();
        c.fillStyle = "#cfd3e0"; c.font = "10px sans-serif";
        c.fillText((col ? "" : S[id].name + " ") + (styled ? "стиль " : "обычн. ") + ph + " " + k, x0 + 4, y0 + 12);
      }));
    });
    return cv.toDataURL("image/png");
  });
  fs.writeFileSync(out, Buffer.from(url.split(",")[1], "base64"));
  console.log("->", out);
  console.log(errors.length ? "ОШИБКИ:\n" + errors.join("\n") : "без ошибок");
  await browser.close();
})();
