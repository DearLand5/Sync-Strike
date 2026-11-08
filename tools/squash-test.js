// Сплющивание героя: node tools/squash-test.js [сек на оружие]
// Бот бьётся каждым оружием ближнего боя и огнестрела; на каждом кадре отрисовки героя считается масштаб силуэта
// ДО ограничения в CharacterRenderer (поза × импульс приземления × разворот × поворот вокруг оси) — так видно,
// какие позы требуют «сплющивания». Печатает минимум ширины и высоты и состояние/приём, где он был.
// Ошибка, если сырая ширина < 0.55 или высота < 0.72 (раньше было до 0.18 — герой превращался в полоску).
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
const secs = +(process.argv[2] || 12);
(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 560 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  const ids = await page.evaluate(() => Object.keys(window.WEAPONS_REF).map(id => [id, window.WEAPONS_REF[id].slot]));
  let bad = 0;
  const pairs = ids.filter(x => x[1] === "melee").map(x => [x[0], "pistol"]).concat(ids.filter(x => x[1] === "gun").map(x => ["dagger", x[0]]));
  for (const [m, gun] of pairs) {
    await page.evaluate(([m, gun]) => {
      const g = window.__game; g.settings.v.meleeWeapon = m; g.settings.v.gunWeapon = gun; g.settings.v.slowmoMode = "off";
      window.__sq = { x: 9, y: 9, wx: "", wy: "" };
      if (!window.__sqHook) {
        window.__sqHook = true;
        const R = window.CharacterRendererRef, draw = R.draw.bind(R);
        R.draw = (ctx, ch, ...a) => {
          if (ch === g.player) {
            const p = ch.anim.pose, st = ch.anim, sq = st.squashT, tc = p.turn ? Math.cos(Math.PI * 2 * p.turn) : 1;
            const kx = p.sx * (1 + sq * 0.18) * (st.turnMul || 1) * Math.max(0.62, Math.abs(tc)), ky = p.sy * (1 - sq * 0.16);
            const where = ch.state + (ch.action ? ":" + ch.action.name + "/" + ch.action.phase : "") + (g.combat.td ? ":td " + g.combat.td.kind : "");
            if (kx < window.__sq.x) { window.__sq.x = kx; window.__sq.wx = where; }
            if (ky < window.__sq.y) { window.__sq.y = ky; window.__sq.wy = where; }
          }
          return draw(ctx, ch, ...a);
        };
      }
      return g.startBattle("waves");
    }, [m, gun]);
    await page.waitForFunction(() => window.__game.state === "battle", null, { timeout: 60000 });
    await page.evaluate(() => {
      const g = window.__game, inp = g.input; let lb = -1, n = 0;
      clearInterval(window.__bot);
      window.__bot = setInterval(() => {
        if (g.state !== "battle") return;
        const p = g.player; p.hp = p.maxHp;
        let t = null, bd = 1e9; for (const e of g.enemies) if (e.targetable) { const d = Math.abs(e.x - p.x); if (d < bd) { bd = d; t = e; } }
        inp.keys.delete("KeyA"); inp.keys.delete("KeyD");
        if (t && Math.abs(t.x - p.x) > 50) inp.keys.add(t.x > p.x ? "KeyD" : "KeyA");
        if (++n % 90 === 0 && p.onGround) inp.push("jump");
        for (const e of g.enemies) if (e.state === "windup" && e.windDur - e.windT < 0.12 && Math.abs(e.x - p.x) < 150) { inp.push("dodge"); break; }
        if (g.clock.nextBeat - g.songNow < 0.03 && g.clock.idx !== lb) { lb = g.clock.idx; inp.push("attack"); }
      }, 16);
    });
    await page.waitForTimeout(secs * 1000);
    const r = await page.evaluate(() => { clearInterval(window.__bot); return window.__sq; });
    const ok = r.x >= 0.55 && r.y >= 0.72;
    console.log(`${ok ? "ok  " : "FAIL"} ${m} + ${gun}: ширина мин ${r.x.toFixed(2)} (${r.wx}), высота мин ${r.y.toFixed(2)} (${r.wy})`);
    if (!ok) bad++;
  }
  await browser.close();
  if (errors.length) { console.log("ОШИБКИ:", errors); bad++; }
  console.log(bad ? `ПРОБЛЕМ: ${bad}` : "всё в норме");
  process.exit(bad ? 1 : 0);
})();
