// Лист кадров рукопашных ударов (12f_martial.js): node tools/martial-sheet.js [оружие|all] [файл.png] [масштаб]
// Оружие: id из WEAPONS (dagger, spear, … kusari) — строка на приём (подготовка, удар, доводка);
// all — одна строка на каждое оружие ближнего боя, колонка на приём (кадр в разгар удара): проверка, что с любым оружием поза верная.
// MOVES=kickFront,elbow — только эти приёмы. Смотреть глазами при правке поз.
const { chromium } = require(process.env.PW || "playwright");
const path = require("path"), fs = require("fs");
const wid = process.argv[2] || "dagger";
const out = process.argv[3] || path.join(__dirname, "../.shots/martial-" + wid + ".png");
const sc = +(process.argv[4] || (wid === "all" ? 2.2 : 2.6));
const only = process.env.MOVES || "";
fs.mkdirSync(path.dirname(out), { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message + "\n" + e.stack));
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  const url = await page.evaluate(([wid, sc, only]) => {
    const g = window.__game, cs = g.combat, A = window.ATTACKS_REF, W = window.WEAPONS_REF;
    const all = Object.keys(A).filter(k => A[k].martial);
    const names = only ? only.split(",") : all;
    const sk = window.SKINS_REF.shade;
    const mk = (x0, gy, air, w) => ({ kind: "player", skin: sk, x: x0, y: gy, facing: 1, scale: sc, anim: new window.AnimStateRef(), scarfColor: sk.scarf, weapon: w, eyeBoost: 0.4, flash: 0, groundY: gy, vx: 0, vy: 0, onGround: !air, w: 12, h: 30, centerY: gy - 16, wExt: 0 });
    const mkAct = (name, ph, k) => {
      const def = window.weaponDefRef(name, g.settings.v);
      const tA = def.startup;
      const t = ph === "startup" ? def.startup * k : ph === "active" ? tA + def.active * k : tA + def.active + def.recovery * k;
      return { name, def, t, phase: ph, startup: def.startup, travel: 0, active: def.active, recovery: def.recovery, dir: 1, target: null, style: null, judge: { rating: "perfect" }, hit: new Set() };
    };
    const air = n => ["airKnee", "airKick", "axeKick"].includes(n);
    let cv, c, cw, cell, rows, cols;
    const frame = (x0, y0, ch, P, label) => {
      Object.assign(ch.anim.pose, window.BASE_POSE_REF, P);
      ch.anim.cloak = P.cloak || 0;
      c.save(); c.beginPath(); c.rect(x0, y0, cw, cell); c.clip();
      c.fillStyle = "#0d0e14"; c.fillRect(x0, y0, cw, cell);
      c.fillStyle = "rgba(255,255,255,.12)"; c.fillRect(x0, y0 + cell * 0.8, cw, 1);
      window.CharacterRendererRef.draw(c, ch);
      c.restore();
      c.fillStyle = "#cfd3e0"; c.font = "10px sans-serif"; c.fillText(label, x0 + 3, y0 + 11);
    };
    if (wid === "all") {
      const wids = Object.keys(W).filter(k => W[k].slot === "melee");
      cell = Math.round(sc * 50); cw = Math.round(sc * 62);
      cols = names.length; rows = wids.length;
      cv = document.createElement("canvas"); cv.width = cols * cw + 90; cv.height = rows * cell;
      c = cv.getContext("2d");
      wids.forEach((w, r) => {
        g.settings.v.meleeWeapon = w;
        names.forEach((n, ci) => {
          const x0 = 90 + ci * cw, y0 = r * cell, gy = y0 + cell * 0.8;
          const ch = mk(x0 + cw * 0.4, gy, air(n), w);
          const act = mkAct(n, "active", n === "axeKick" ? 0.2 : 0.55);
          const P = cs.actionPose(ch, act);
          frame(x0, y0, ch, P, r ? "" : n);
        });
        c.fillStyle = "#cfd3e0"; c.font = "12px sans-serif"; c.fillText(w, 4, r * cell + cell * 0.5);
      });
      return cv.toDataURL("image/png");
    }
    g.settings.v.meleeWeapon = wid;
    const colsDef = [["startup", 0.4], ["startup", 1], ["active", 0.15], ["active", 0.5], ["active", 0.9], ["recovery", 0.3], ["recovery", 0.75]];
    cell = Math.round(sc * 52); cw = Math.round(sc * 60);
    cols = colsDef.length; rows = names.length;
    cv = document.createElement("canvas"); cv.width = cols * cw; cv.height = rows * cell;
    c = cv.getContext("2d");
    names.forEach((n, r) => colsDef.forEach(([ph, k], ci) => {
      const x0 = ci * cw, y0 = r * cell, gy = y0 + cell * 0.8;
      const ch = mk(x0 + cw * 0.4, gy, air(n), wid);
      const act = mkAct(n, ph, k);
      const P = cs.actionPose(ch, act);
      frame(x0, y0, ch, P, (ci ? "" : n + " ") + ph[0] + k);
    }));
    return cv.toDataURL("image/png");
  }, [wid, sc, only]);
  fs.writeFileSync(out, Buffer.from(url.split(",")[1], "base64"));
  console.log("лист:", out);
  console.log(errors.length ? "ОШИБКИ:\n" + errors.join("\n") : "без ошибок");
  await browser.close();
})();
