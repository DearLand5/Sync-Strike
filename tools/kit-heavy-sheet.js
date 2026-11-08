// Лист кадров анимаций «тяжёлых» наборов (копьё/глефа/топор): node tools/kit-heavy-sheet.js [spear|glaive|axe] [файл.png] [масштаб]
// Строка на приём (базовые приёмы с позой оружия + свои комбинации): подготовка, (путь), удар, доводка. Внизу — кадры добивания.
const { chromium } = require(process.env.PW || "playwright");
const path = require("path"), fs = require("fs");
const wid = process.argv[2] || "spear";
const out = process.argv[3] || path.join(__dirname, "../.shots/kit-heavy-" + wid + ".png");
const sc = +(process.argv[4] || 2.6);
fs.mkdirSync(path.dirname(out), { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message + "\n" + e.stack));
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  const url = await page.evaluate(([wid, sc]) => {
    const g = window.__game, cs = g.combat, A = window.ATTACKS_REF;
    g.settings.v.meleeWeapon = wid;
    const mine = Object.keys(A).filter(k => A[k].kit === wid);
    const base = ["slash1", "slash2", "slash3", "thrust", "rise", "dash", "cross", "flurry", "riposte", "airSlash", "dive"];
    const names = base.concat(mine);
    const cols = [["startup", 0.3], ["startup", 1], ["travel", 0.5], ["active", 0.1], ["active", 0.5], ["active", 0.95], ["recovery", 0.25], ["recovery", 0.7]];
    const cell = Math.round(sc * 52), cw = Math.round(sc * 100), tdIds = { spear: ["spear_impale", "spear_impale_big"], glaive: ["glaive_moon", "glaive_moon_big"], axe: ["axe_headsman", "axe_headsman_big"] }[wid];
    const rows = names.length + tdIds.length, cv = document.createElement("canvas");
    cv.width = cols.length * cw; cv.height = rows * cell;
    const c = cv.getContext("2d"), sk = window.SKINS_REF.shade;
    const mk = (x0, gy, air) => ({ kind: "player", skin: sk, x: x0 + cw * 0.3, y: gy, facing: 1, scale: sc, anim: new window.AnimStateRef(), scarfColor: sk.scarf, weapon: wid, eyeBoost: 0.4, flash: 0, groundY: gy, vx: 0, vy: 0, onGround: !air, w: 12, h: 30, centerY: gy - 16, wExt: 0 });
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
    names.forEach((name, row) => {
      const def = window.weaponDefRef(name, g.settings.v);
      cols.forEach(([ph, k], ci) => {
        const x0 = ci * cw, y0 = row * cell, gy = y0 + cell * 0.8;
        const air = name === "airSlash" || name === "dive";
        const ch = mk(x0, gy, air);
        const travel = def.kind === "dash" ? 0.12 : 0;
        const tA = def.startup + travel;
        let phase = ph, kk = k;
        if (ph === "travel" && !travel) { phase = "active"; kk = 0.02; }
        const t = phase === "startup" ? def.startup * kk : phase === "travel" ? def.startup + travel * kk : phase === "active" ? tA + def.active * kk : tA + def.active + def.recovery * kk;
        const act = { name, def, t, phase, startup: def.startup, travel, active: def.active, recovery: def.recovery, dir: 1, target: null, style: null, judge: { rating: "perfect" }, caught: false, hit: new Set() };
        const P = cs.actionPose(ch, act);
        frame(x0, y0, ch, P, (ci ? "" : name + " ") + phase[0] + k);
      });
    });
    tdIds.forEach((id, i) => {
      const row = names.length + i, dur = { spear_impale: 0.88, spear_impale_big: 1.18, glaive_moon: 0.98, glaive_moon_big: 1.28, axe_headsman: 1.0, axe_headsman_big: 1.55 }[id];
      cols.forEach((_, ci) => {
        const x0 = ci * cw, y0 = row * cell, gy = y0 + cell * 0.8, ch = mk(x0, gy, false);
        const t = dur * (ci + 0.5) / cols.length;
        const P = cs.tdPose(ch, { kind: id, t, dur, dir: 1, e: { centerY: gy - 12, x: 0 } });
        frame(x0, y0, ch, P, (ci ? "" : id + " ") + t.toFixed(2));
      });
    });
    return cv.toDataURL("image/png");
  }, [wid, sc]);
  fs.writeFileSync(out, Buffer.from(url.split(",")[1], "base64"));
  console.log("лист:", out);
  console.log(errors.length ? "ОШИБКИ:\n" + errors.join("\n") : "без ошибок");
  await browser.close();
})();
