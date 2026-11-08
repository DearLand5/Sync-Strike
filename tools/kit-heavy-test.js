// Наборы копья, глефы и топора (12k_a_heavy.js): node tools/kit-heavy-test.js
// Для каждого оружия: две собственные комбинации (вызываются точными нажатиями против неподвижных врагов с большим HP, считаем попадания и урон)
// и добивания (обычное и для громилы): сценарий срабатывает, не зависает, враг умирает, управление возвращается.
// Скриншоты: .shots/kh-<сценарий>.png. Ошибки страницы — провал.
const { chromium } = require(process.env.PW || "playwright");
const path = require("path"), fs = require("fs");
const shots = path.join(__dirname, "../.shots");
fs.mkdirSync(shots, { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 560 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message + "\n" + e.stack));
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  await page.evaluate(() => { const g = window.__game; g.settings.v.poseMode = "off"; g.settings.v.slowmoMode = "normal"; g.settings.v.assist = true; g.startBattle("waves"); });
  await page.waitForFunction(() => window.__game.state === "battle", null, { timeout: 60000 });
  await page.evaluate(() => {
    const g = window.__game, c = g.combat;
    window.__names = []; window.__hits = 0; window.__hitLog = []; window.__plan = [];
    const ex = c.execute.bind(c);
    c.execute = s => { const r = ex(s); if (g.player.action) window.__names.push(g.player.action.name); return r; };
    const ah = c._applyHit.bind(c);
    c._applyHit = (e, act, ...a) => { window.__hits++; window.__hitLog.push(act.name + ":" + (act.sub || 0)); return ah(e, act, ...a); };
    // подвисание добивания на заданном td.t — чтобы снять кадр в середине
    const ut = c.updateTakedown.bind(c);
    c.updateTakedown = dt => { if (window.__tdHold != null && c.td && c.td.t >= window.__tdHold) return; ut(dt); };
    const cu = g.clock.update.bind(g.clock);
    g.clock.update = (t, dt, l, pl) => {
      cu(t, dt, l, pl);
      const p = g.player;
      p.hp = p.maxHp; p.iframes = Math.max(p.iframes, 0.2);
      if (window.__pin) for (const e of g.enemies) { if (e.__pinx != null && e.executed !== true) e.x = e.__pinx; e.vx = 0; e.attackCD = 9; if (e.alive && e.y < 0 && e.state !== "hurt" && !e.executed) { e.y = 0; e.vy = 0; e.onGround = true; } }
      while (window.__plan.length && t >= window.__plan[0]) { const at = window.__plan.shift(); if (t - at < 0.1) c.onAttackPress(at); }
    };
    window.__setup = (dists, opts = {}) => {
      g.waves.queue = []; g.waves.pending = []; g.waves.between = 999;
      for (const e of g.enemies) e.dead = true; g.enemies = [];
      const p = g.player; p.x = 600; p.y = 0; p.vx = 0; p.vy = 0; p.onGround = true; p.action = null; p.scripted = false; p.setState("idle"); p.facing = 1; p.counterT = 0;
      Object.assign(c, { comboStep: 0, lastMeleeT: -9, shotChain: 0, lastAction: null, lastActionT: -9, chain: opts.chain || 0, airChain: 0, lastPress: null, lastTdT: opts.td ? -99 : 99, combo: 0, _kitT: {} });
      for (const d of [].concat(dists)) {
        const e = g.waves.spawn(opts.kind || "blade", true);
        e.x = p.x + d; e.__pinx = e.x; e.y = 0; e.maxHp = e.hp = opts.hp || 1e5; e.attackCD = 99;
      }
      window.__pin = true; window.__tdHold = null;
      window.__names.length = 0; window.__hits = 0; window.__hitLog = []; window.__plan.length = 0;
    };
    window.__dmg = () => g.enemies.reduce((s, e) => s + (e.maxHp - e.hp), 0);
    // ближайшая доля (сильная или нет) не раньше now+ahead; k — сколько долей до неё
    // начало серии из двух ударов: ни одна из двух долей не сильная (иначе вместо удара выйдет подброс)
    window.__beatPair = (ahead = 1.2) => {
      const cl = g.clock, m = cl.map, P = cl.period; let t = cl.nextBeatAfter(g.songNow, ahead), i = 0;
      // доли трека не идеально ровные: вторую долю берём настоящую (nextBeatAfter), а не t + P
      const strongAt = x => { const k = m.beats.findIndex(b => Math.abs(b + cl.correction - x) < 0.03); return k >= 0 && m.strong[k]; };
      const next = x => cl.nextBeatAfter(x, 0.05);
      while (i++ < 40 && (strongAt(t) || strongAt(next(t)))) t = next(t);
      window.__pair2 = next(t);
      return t;
    };
    window.__beatAt = (strong, ahead = 1.2) => {
      const cl = g.clock, m = cl.map; let t = cl.nextBeatAfter(g.songNow, ahead), i = 0;
      while (i++ < 40) { const k = m.beats.findIndex(b => Math.abs(b + cl.correction - t) < 1e-3); if (k >= 0 && !!m.strong[k] === strong) return t; t = cl.nextBeatAfter(t, 0.05); }
      return t;
    };
  });
  const wait = ms => page.waitForTimeout(ms);
  const done = async () => { await page.waitForFunction(() => !window.__plan.length && !window.__game.player.action && window.__game.player.onGround, null, { timeout: 9000 }).catch(() => {}); await wait(350); };
  const res = () => page.evaluate(() => ({ names: window.__names.slice(), hits: window.__hits, log: window.__hitLog.join(" "), dmg: Math.round(window.__dmg()), enemies: window.__game.enemies.length }));
  const use = id => page.evaluate(id => { window.__game.settings.v.meleeWeapon = id; }, id);
  let bad = 0, r = null;
  const check = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg + (ok || !r ? "" : "   [" + r.names.join(",") + " | " + r.log + "]")); if (!ok) bad++; };

  // ---- комбинации ----
  console.log("— копьё —");
  await use("spear");
  // Вращение древка: два удара в такт и третий на сильной доле
  await page.evaluate(() => { window.__setup(28); const ts = window.__beatAt(true, 1.8), P = window.__game.clock.period; window.__plan.push(ts - 2 * P - 0.02, ts - P - 0.02, ts - 0.02); });
  await done(); r = await res();
  check(r.names.join(",") === "slash1,slash2,spear_whirl", `Вращение древка: ${r.names.join(" → ")}`);
  check(r.hits >= 5, `Вращение древка: попаданий ${r.hits} (2 удара + 3 тика)`);
  await page.evaluate(() => { window.__setup(28); const ts = window.__beatAt(true, 1.8), P = window.__game.clock.period; window.__plan.push(ts - 2 * P - 0.02, ts - P - 0.02, ts - 0.02); window.__shotAt = ts; });
  await page.waitForFunction(() => window.__game.player.action && window.__game.player.action.name === "spear_whirl" && window.__game.player.action.phase === "active", null, { timeout: 9000 }).catch(() => {});
  await page.screenshot({ path: path.join(shots, "kh-spear-whirl.png") });
  await done();
  // Бросок-возврат: точное нажатие, цель на 150
  await page.evaluate(() => { window.__setup(150); window.__plan.push(window.__beatAt(false, 1.0) - 0.02); });
  await page.waitForFunction(() => window.__game.player.action && window.__game.player.action.name === "spear_throw" && window.__game.player.action.t > 0.2, null, { timeout: 9000 }).catch(() => {});
  await page.screenshot({ path: path.join(shots, "kh-spear-throw.png") });
  await done(); r = await res();
  check(r.names[0] === "spear_throw", `Бросок-возврат: ${r.names.join(" → ")}`);
  check(r.hits >= 2 && r.dmg >= 20, `Бросок-возврат: попаданий ${r.hits} (туда и обратно), урон ${r.dmg}`);
  check(await page.evaluate(() => window.__game.combat.projectiles.length === 0 && window.__game.player.weapon === "spear"), "Бросок-возврат: копьё вернулось в руку, снарядов нет");

  console.log("— глефа —");
  await use("glaive");
  await page.evaluate(() => { window.__setup([30, -30]); window.__plan.push(window.__beatAt(false, 1.0) - 0.02); });
  await page.waitForFunction(() => window.__game.player.action && window.__game.player.action.name === "glaive_circle" && window.__game.player.action.phase === "active", null, { timeout: 9000 }).catch(() => {});
  await wait(60);
  await page.screenshot({ path: path.join(shots, "kh-glaive-circle.png") });
  await done(); r = await res();
  check(r.names[0] === "glaive_circle", `Лунный круг: ${r.names.join(" → ")}`);
  check(r.hits >= 3, `Лунный круг: попаданий ${r.hits} по двум врагам, урон ${r.dmg}`);
  // Подсечка: два удара в долю, затем «и»
  await page.evaluate(() => { window.__setup(28); const t = window.__beatPair(1.0), t2 = window.__pair2; window.__plan.push(t - 0.02, t2 - 0.02, t2 + (t2 - t) / 2 - 0.02); });
  await done(); r = await res();
  check(r.names[2] === "glaive_sweep", `Подсечка: ${r.names.join(" → ")}`);
  check(r.log.includes("glaive_sweep"), `Подсечка: попала (${r.log}), урон ${r.dmg}`);

  console.log("— топор —");
  await use("axe");
  await page.evaluate(() => { window.__setup([28, 86]); window.__plan.push(window.__beatAt(true, 1.0) - 0.02); });
  await page.waitForFunction(() => window.__game.player.action && window.__game.player.action.name === "axe_cleave" && window.__game.player.action.phase === "recovery", null, { timeout: 9000 }).catch(() => {});
  await page.screenshot({ path: path.join(shots, "kh-axe-cleave.png") });
  await done(); r = await res();
  check(r.names[0] === "axe_cleave", `Раскол земли: ${r.names.join(" → ")}`);
  check(r.hits >= 2, `Раскол земли: удар + ударная волна по соседу: ${r.hits}, урон ${r.dmg}`);
  await page.evaluate(() => { window.__setup(150); window.__plan.push(window.__beatAt(false, 1.0) - 0.02); });
  await page.waitForFunction(() => window.__game.player.action && window.__game.player.action.name === "axe_throw" && window.__game.player.action.t > 0.25, null, { timeout: 9000 }).catch(() => {});
  await page.screenshot({ path: path.join(shots, "kh-axe-throw.png") });
  await done(); r = await res();
  check(r.names[0] === "axe_throw", `Бросок топора: ${r.names.join(" → ")}`);
  check(r.hits >= 2, `Бросок топора: попаданий ${r.hits} (туда и обратно), урон ${r.dmg}`);
  check(await page.evaluate(() => window.__game.combat.projectiles.length === 0 && window.__game.player.weapon === "axe"), "Бросок топора: вернулся в руку");

  // ---- добивания ----
  const holds = { spear_impale: [0.2, 0.31, 0.42], spear_impale_big: [0.3, 0.7, 0.9], glaive_moon: [0.4, 0.5, 0.6], glaive_moon_big: [0.5, 0.75, 0.9], axe_headsman: [0.36, 0.5, 0.7], axe_headsman_big: [0.4, 0.62, 1.0] };
  const cases = [["spear", "blade", "spear_impale"], ["spear", "brute", "spear_impale_big"], ["glaive", "blade", "glaive_moon"], ["glaive", "brute", "glaive_moon_big"], ["axe", "blade", "axe_headsman"], ["axe", "brute", "axe_headsman_big"]];
  console.log("— добивания —");
  for (const [w, kind, id] of cases) {
    await use(w);
    await page.evaluate(([kind]) => { window.__setup(28, { kind, td: true, hp: 4 }); window.__plan.push(window.__beatAt(false, 1.0) - 0.02); }, [kind]);
    const got = await page.waitForFunction(() => window.__game.combat.td && window.__game.combat.td.kind, null, { timeout: 9000 }).then(h => h.jsonValue()).catch(() => null);
    check(got === id, `добивание ${w}/${kind}: ${got}`);
    if (got === id) {
      let n = 0;
      for (const hold of holds[id]) {
        await page.evaluate(h => { window.__tdHold = h; }, hold);
        await page.waitForFunction(h => !window.__game.combat.td || window.__game.combat.td.t >= h - 0.001, hold, { timeout: 12000 }).catch(() => {});
        await wait(120);
        await page.screenshot({ path: path.join(shots, `kh-td-${id}-${++n}.png`) });
      }
      await page.evaluate(() => { window.__tdHold = null; });
      const fin = await page.waitForFunction(() => !window.__game.combat.td, null, { timeout: 15000 }).then(() => true).catch(() => false);
      await wait(900);
      const st = await page.evaluate(() => { const g = window.__game, p = g.player; return { scripted: p.scripted, state: p.state, alive: g.enemies.some(e => e.alive), letter: g.letterboxTarget }; });
      check(fin && !st.scripted && st.state !== "takedown" && !st.alive && st.letter === 0, `добивание ${id}: завершилось, управление вернулось (${JSON.stringify(st)}), враг мёртв`);
    }
  }
  await browser.close();
  if (errors.length) { console.log("ОШИБКИ:\n" + errors.join("\n")); bad++; }
  console.log(bad ? `ПРОБЛЕМ: ${bad}` : "всё в норме");
  process.exit(bad ? 1 : 0);
})();
