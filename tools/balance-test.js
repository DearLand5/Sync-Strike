// Баланс сложностей: три профиля игрока × три сложности. node tools/balance-test.js [seconds]
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
const secs = +(process.argv[2] || 90);
const PROFILES = {
  pro:    { jitter: 0.0,  attackP: 1.0, dodgeP: 0.9 },   // в такт, почти всегда уклоняется
  mid:    { jitter: 0.09, attackP: 0.8, dodgeP: 0.5 },   // неточно, уклоняется через раз
  casual: { jitter: 0.2,  attackP: 0.6, dodgeP: 0.2 },   // как новичок
};
async function run(browser, diff, prof) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  await page.evaluate(([diff, P]) => {
    const g = window.__game;
    g.settings.set("difficulty", diff);
    window.__waveT = [];
    const ows = g.onWaveStart.bind(g);
    g.onWaveStart = n => { window.__waveT.push(Math.round(g.combat.time)); return ows(n); };
    g.startBattle("waves").then(() => {
      const inp = g.input, decided = new Map();
      let nextAttack = 0, lastBeat = -1;
      setInterval(() => {
        if (g.state !== "battle") return;
        const p = g.player;
        let tgt = null, bd = 1e9;
        for (const e of g.enemies) if (e.targetable) { const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y) * 0.5; if (d < bd) { bd = d; tgt = e; } }
        inp.keys.delete("KeyA"); inp.keys.delete("KeyD");
        if (tgt && Math.abs(tgt.x - p.x) > 60) inp.keys.add(tgt.x > p.x ? "KeyD" : "KeyA");
        if (tgt && tgt.y < p.y - 60 && p.onGround && Math.random() < 0.05) inp.push("jump");
        for (const e of g.enemies) if (e.state === "windup" && Math.abs(e.x - p.x) < 170) {
          const key = e.id + ":" + Math.round(e.windDur * 1000);
          if (!decided.has(key)) decided.set(key, Math.random() < P.dodgeP);
          if (decided.get(key) && e.windDur - e.windT < 0.12) { inp.push("dodge"); decided.set(key, false); }
        }
        // атака около доли с разбросом
        if (nextAttack && g.songNow >= nextAttack) { inp.push("attack"); nextAttack = 0; }
        if (g.clock.idx !== lastBeat && !nextAttack) { lastBeat = g.clock.idx; if (Math.random() < P.attackP) nextAttack = g.clock.nextBeat + (Math.random() * 2 - 1) * P.jitter; }
      }, 16);
    });
  }, [diff, PROFILES[prof]]);
  await page.waitForTimeout(secs * 1000);
  const r = await page.evaluate(() => { const g = window.__game; return { st: g.state, alive: g.player.alive, hp: Math.round(g.player.hp), maxHp: g.player.maxHp, wave: g.waves.wave, kills: g.combat.kills, dmg: Math.round(g.combat.damageTaken), t: Math.round(g.combat.time), waveT: window.__waveT.join(",") }; });
  await page.close();
  return { diff, prof, ...r, errors: errors.length };
}
(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  for (const diff of (process.argv[3] || "easy,normal,hard").split(",")) {
    const res = await Promise.all(Object.keys(PROFILES).map(p => run(browser, diff, p)));
    for (const r of res) console.log(JSON.stringify(r));
  }
  await browser.close();
})();
