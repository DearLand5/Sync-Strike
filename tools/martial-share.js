// Доля рукопашных ударов в бою: node tools/martial-share.js [сек на оружие] [оружие,оружие,…]   (по умолчанию 30 с, dagger,katana,axe)
// Бот идёт к ближайшему врагу, бьёт на каждой доле, уклоняется от замахов (как bot-test). Считаются приёмы, выбранные при нажатии:
// рукопашные (12f_martial: ATTACKS[имя].martial) против остальных ближних (клинок, комбинации, рывок, приёмы наборов); огнестрел отдельно.
// Ориентир: 30–45% ударов ближнего боя. Ошибки страницы или доля < 20% — провал (код 1).
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
const secs = +(process.argv[2] || 30), weapons = (process.argv[3] || "dagger,katana,axe").split(",");
(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  let bad = 0;
  for (const w of weapons) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 560 } });
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto("file://" + path.join(__dirname, "../index.html"));
    await page.waitForTimeout(300);
    await page.evaluate(m => { const g = window.__game; g.settings.v.meleeWeapon = m; g.settings.v.slowmoMode = "off"; g.startBattle("waves"); }, w);
    await page.waitForFunction(() => window.__game.state === "battle", null, { timeout: 60000 });
    await page.evaluate(() => {
      const g = window.__game, inp = g.input, c = g.combat; let lb = -1;
      window.__cnt = {};
      const ex = c.execute.bind(c);
      c.execute = s => { const r = ex(s); const a = g.player.action; if (a) window.__cnt[a.name] = (window.__cnt[a.name] || 0) + 1; return r; };
      setInterval(() => {
        if (g.state !== "battle") return;
        const p = g.player; p.hp = p.maxHp;
        let t = null, bd = 1e9; for (const e of g.enemies) if (e.targetable) { const d = Math.abs(e.x - p.x); if (d < bd) { bd = d; t = e; } }
        inp.keys.delete("KeyA"); inp.keys.delete("KeyD");
        if (t && Math.abs(t.x - p.x) > 45) inp.keys.add(t.x > p.x ? "KeyD" : "KeyA");
        for (const e of g.enemies) if (e.state === "windup" && e.windDur - e.windT < 0.12 && Math.abs(e.x - p.x) < 150) { inp.push("dodge"); break; }
        if (g.clock.nextBeat - g.songNow < 0.03 && g.clock.idx !== lb) { lb = g.clock.idx; inp.push("attack"); }
      }, 16);
    });
    await page.waitForTimeout(secs * 1000);
    const r = await page.evaluate(() => {
      const A = window.ATTACKS_REF, cnt = window.__cnt; let mar = 0, mel = 0, rng = 0;
      for (const n in cnt) { const d = A[n]; if (d && d.martial) mar += cnt[n]; else if (d && d.kind === "ranged") rng += cnt[n]; else mel += cnt[n]; }
      return { cnt, mar, mel, rng };
    });
    const share = 100 * r.mar / Math.max(1, r.mar + r.mel);
    const ok = share >= 20 && !errors.length;
    console.log((ok ? "ok   " : "FAIL ") + w + ": рукопашных " + r.mar + ", оружием " + r.mel + ", огнестрел " + r.rng + " — доля среди ближних " + share.toFixed(0) + "%");
    console.log("     " + JSON.stringify(r.cnt));
    if (errors.length) console.log("ОШИБКА СТРАНИЦЫ: " + errors[0]);
    if (!ok) bad++;
    await page.close();
  }
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
