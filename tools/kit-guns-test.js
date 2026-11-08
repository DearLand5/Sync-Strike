// Наборы огнестрела (12k_c_guns): «Ржавый обрез» и «Тяжёлый револьвер»: node tools/kit-guns-test.js
// Комбинации вызываются точными нажатиями против неподвижных врагов с большим HP:
//   обрез — Дуплет (два залпа: на доле и на полдоле), Удар прикладом (вплотную после выстрела: приклад + залп в упор);
//   револьвер — Веер курка (сильная доля, грув ≥ 2: по всем врагам впереди), Рикошет (точный выстрел, пуля бьёт второго врага),
//   прокрутка после серии (kSeries). Добивания: «Дуплет в упор» и «Дуэль» срабатывают, завершаются, герой свободен, враг мёртв.
// Скриншоты: .shots/kg-*.png (середины добиваний — по удержанию сценария на заданном td.t). Ошибки страницы — провал.
const { chromium } = require(process.env.PW || "playwright");
const path = require("path"), fs = require("fs");
const shots = path.join(__dirname, "../.shots");
fs.mkdirSync(shots, { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 560 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message + "\n" + e.stack));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  await page.evaluate(() => { const g = window.__game; g.settings.v.poseMode = "off"; g.settings.v.slowmoMode = "off"; g.settings.v.assist = true; g.startBattle("waves"); });
  await page.waitForFunction(() => window.__game.state === "battle", null, { timeout: 60000 });
  await page.evaluate(() => {
    const g = window.__game, c = g.combat;
    window.__names = []; window.__acts = [];
    const ex = c.execute.bind(c);
    c.execute = s => { const r = ex(s); if (g.player.action) { window.__names.push(g.player.action.name); window.__acts.push(g.player.action); } return r; };
    const ah = c._applyHit.bind(c);
    window.__hits = 0; window.__hitLog = []; window.__hitT = [];
    c._applyHit = (e, act, ...a) => { window.__hits++; window.__hitLog.push(act.name + "@" + (act.t || 0).toFixed(2) + (act.dmgK && act.dmgK < 1 ? "/" + act.dmgK.toFixed(2) : "") + ":" + Math.round(e.x - g.player.x)); window.__hitT.push(g.songNow); return ah(e, act, ...a); };
    // замораживание сценария добивания на заданном td.t (для скриншотов)
    const ut = c.updateTakedown.bind(c);
    c.updateTakedown = dt => { if (window.__tdHold != null && c.td && c.td.t >= window.__tdHold) return; ut(dt); };
    window.__plan = []; window.__sched = [];
    const cu = g.clock.update.bind(g.clock);
    g.clock.update = (t, dt, l, pl) => {
      cu(t, dt, l, pl);
      const p = g.player;
      if (!c.td) { p.hp = p.maxHp; p.iframes = Math.max(p.iframes, 0.2); }
      if (window.__pin != null) for (const e of g.enemies) { if (e.__pinx != null && !e.executed && e.alive) e.x = e.__pinx; e.vx = 0; e.attackCD = 9; }
      while (window.__sched.length && t >= window.__sched[0].t) window.__sched.shift().fn();
      while (window.__plan.length && t >= window.__plan[0]) { const at = window.__plan.shift(); if (t - at < 0.1) c.onAttackPress(at); }
    };
    window.__setup = (dists, opts = {}) => {
      g.waves.queue = []; g.waves.pending = []; g.waves.between = 999;
      for (const e of g.enemies) e.dead = true; g.enemies = [];
      const p = g.player; p.x = 600; p.y = 0; p.vx = 0; p.vy = 0; p.onGround = true; p.action = null; p.setState("idle"); p.facing = 1; p.counterT = 0;
      Object.assign(c, { comboStep: 0, lastMeleeT: -9, shotChain: 0, lastAction: null, lastActionT: -9, chain: opts.chain || 0, airChain: 0, lastPress: null, lastTdT: 99, combo: 0 });
      for (const d of [].concat(dists)) {
        const e = g.waves.spawn(opts.kind || "blade", true);
        e.x = p.x + d; e.__pinx = e.x; e.y = 0; e.maxHp = e.hp = 1e5; e.attackCD = 99;
      }
      window.__pin = true;
      window.__names.length = 0; window.__acts.length = 0; window.__hits = 0; window.__hitLog = []; window.__hitT = []; window.__plan.length = 0; window.__sched.length = 0;
    };
    // ближайшая доля, сильная (strong=true) или нет; через ≥ 0.9 с (враг успевает выйти из портала)
    window.__beat = (strong, after = 0.9) => {
      const cl = g.clock, m = cl.map;
      let t = cl.nextBeatAfter(g.songNow, after), i = 0;
      const isS = x => { const k = m.beats.findIndex(b => Math.abs(b + cl.correction - x) < 1e-3); return k >= 0 && !!m.strong[k]; };
      while (i++ < 24 && isS(t) !== strong) t = cl.nextBeatAfter(t, 0.05);
      return t;
    };
    window.__beats = (n, off = -0.02) => {
      const cl = g.clock, P = cl.period; let b = cl.nextBeatAfter(g.songNow, 0.9);
      for (let i = 0; i < n; i++) { window.__plan.push(b + off); b = cl.nextBeatAfter(b, P * 0.5); }
    };
    window.__hpLoss = () => g.enemies.map(e => Math.round(1e5 - e.hp));
  });
  const wait = ms => page.waitForTimeout(ms);
  const done = async () => { await page.waitForFunction(() => !window.__plan.length && !window.__sched.length && !window.__game.player.action && window.__game.player.onGround, null, { timeout: 9000 }).catch(() => {}); await wait(350); };
  const res = () => page.evaluate(() => ({ names: window.__names.slice(), hits: window.__hits, log: window.__hitLog.join(" "), hitT: window.__hitT.slice(), loss: window.__hpLoss(), period: window.__game.clock.period, kSeries: window.__acts.map(a => !!a.kSeries), onBeat: window.__acts.filter(a => a.onBeat).length, labels: Object.assign({}, window.__game.combat.combos) }));
  const use = gn => page.evaluate(gn => { const g = window.__game; g.settings.v.meleeWeapon = "dagger"; g.settings.v.gunWeapon = gn; }, gn);
  let bad = 0, r = null;
  const check = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg + (ok || !r ? "" : "   [попадания: " + r.log + "]")); if (!ok) bad++; };

  // ---------------- обрез ----------------
  console.log("— Ржавый обрез —");
  await use("sawed");
  // 1) Дуплет: сильная доля, точно
  await page.evaluate(() => { window.__setup(250); window.__plan.push(window.__beat(true) - 0.02); });
  await done(); r = await res();
  check(r.names[0] === "duplet", `Дуплет выбран: ${r.names.join(" → ")}`);
  check(r.hits >= 2, `Дуплет: два залпа (попаданий ${r.hits})`);
  if (r.hitT.length >= 2) {
    const gap = r.hitT[1] - r.hitT[0], half = Math.min(0.36, Math.max(0.15, r.period / 2));
    check(Math.abs(gap - half) < 0.06, `Дуплет: второй залп через ${(gap * 1000).toFixed(0)} мс после первого (полдоли ${(half * 1000).toFixed(0)} мс, допуск 60)`);
  }
  console.log(`     урон за нажатие: ${Math.round(r.loss[0])}`);
  const dupDmg = r.loss[0];
  check(dupDmg > 30 && dupDmg < 55, `Дуплет: урон ${Math.round(dupDmg)} в пределах 30–55`);
  await page.screenshot({ path: path.join(shots, "kg-duplet.png") });
  // 2) Удар прикладом: выстрел издалека, затем враг вплотную и нажатие в долю
  await page.evaluate(() => {
    window.__setup(260);
    const t1 = window.__beat(false), cl = window.__game.clock;
    window.__plan.push(t1 - 0.02);
    window.__sched.push({ t: t1 + 0.25, fn: () => { for (const e of window.__game.enemies) { e.__pinx = window.__game.player.x + 46; e.x = e.__pinx; } } });
    window.__plan.push(cl.nextBeatAfter(t1, cl.period * 0.5) - 0.02);
  });
  await done(); r = await res();
  check(r.names.join(",") === "shot,buttstock", `Удар прикладом: ${r.names.join(" → ")}`);
  check(r.hits >= 3, `Удар прикладом: приклад + залп в упор (попаданий ${r.hits}, ≥ 3 с первым выстрелом)`);
  if (r.hitT.length >= 3) {
    const gap = r.hitT[2] - r.hitT[1], half = Math.min(0.36, Math.max(0.15, r.period / 2));
    check(Math.abs(gap - half) < 0.07, `Удар прикладом: залп через ${(gap * 1000).toFixed(0)} мс после приклада (полдоли ${(half * 1000).toFixed(0)} мс)`);
  }
  console.log(`     урон за серию (выстрел + приклад + залп): ${Math.round(r.loss[0])}`);
  await page.screenshot({ path: path.join(shots, "kg-buttstock.png") });
  // 3) без выстрела до этого вплотную остаётся ближний приём кинжала (приклад — только «подобрался во время стрельбы»)
  await page.evaluate(() => { window.__setup(46); window.__plan.push(window.__beat(false) - 0.02); });
  await done(); r = await res();
  check(!r.names.includes("buttstock"), `вплотную без выстрела — ближний бой: ${r.names.join(" → ")}`);
  // 4) обычные выстрелы с позами набора (дальше 210): без ошибок
  await page.evaluate(() => { window.__setup(380); window.__beats(5); });
  await done(); r = await res();
  check(r.hits >= 1, `обрез: серия выстрелов ${r.names.join(" → ")}, попаданий ${r.hits}`);

  // ---------------- револьвер ----------------
  console.log("— Тяжёлый револьвер —");
  await use("revolver");
  // 5) Веер курка: сильная доля, точно, грув ≥ 2, три врага впереди
  await page.evaluate(() => { window.__setup([240, 320, 400], { chain: 9 }); window.__plan.push(window.__beat(true) - 0.02); });
  await done(); r = await res();
  check(r.names[0] === "fanning", `Веер курка выбран: ${r.names.join(" → ")}`);
  check(r.hits >= 6, `Веер курка: попаданий ${r.hits} (≥ 6)`);
  check(r.loss.length === 3 && r.loss.every(d => d > 0), `Веер курка: задел всех трёх врагов (урон ${r.loss.join(" / ")})`);
  const fanDmg = r.loss.reduce((a, b) => a + b, 0);
  check(fanDmg > 30 && fanDmg < 60, `Веер курка: урон за нажатие ${Math.round(fanDmg)} (30–60; при точном ударе на сильной доле Двойной/Веер револьвера ≈ 45)`);
  await page.screenshot({ path: path.join(shots, "kg-fanning.png") });
  // 6) Рикошет: точный выстрел, два врага
  await page.evaluate(() => { window.__setup([250, 340]); window.__plan.push(window.__beat(false) - 0.02); });
  await done(); r = await res();
  check(r.names[0] === "ricochet", `Рикошет выбран: ${r.names.join(" → ")}`);
  check(r.loss.length === 2 && r.loss.every(d => d > 0), `Рикошет: пуля задела обоих врагов (урон ${r.loss.join(" / ")})`);
  check(r.hits === 2, `Рикошет: ровно два попадания (${r.hits})`);
  await page.screenshot({ path: path.join(shots, "kg-ricochet.png") });
  // 7) один враг: рикошета нет, обычный точный выстрел
  await page.evaluate(() => { window.__setup(300); window.__plan.push(window.__beat(false) - 0.02); });
  await done(); r = await res();
  check(r.names[0] !== "ricochet" && r.hits >= 1, `один враг — без рикошета: ${r.names.join(" → ")}`);
  // 8) прокрутка после серии: три выстрела подряд
  await page.evaluate(() => { window.__setup(380); window.__beats(4, -0.02); });
  await done(); r = await res();
  check(r.kSeries.some(Boolean), `прокрутка после серии: kSeries ${JSON.stringify(r.kSeries)} (${r.names.join(" → ")})`);

  // ---------------- добивания ----------------
  console.log("— добивания —");
  await page.evaluate(() => { window.__game.settings.v.slowmoMode = "normal"; });
  const runTd = async (gn, id, kind, hold) => {
    await use(gn);
    await page.evaluate(() => { window.__pin = null; });
    const start = await page.evaluate(([kind]) => {
      const g = window.__game; g.waves.queue = []; g.waves.between = 999; for (const e of g.enemies) e.dead = true; g.enemies = [];
      g.combat.lastTdT = -9; g.combat.td = null; g.player.reset(600); g.player.hp = 100;
      const e = g.waves.spawn(kind); e.__pinx = null; e.x = 800; e.y = 0; e.state = "think"; e.hp = 1; e.attackCD = 99;
      window.__tde = e;
      const act = { def: window.weaponDefRef("shot", g.settings.v), name: "shot", judge: { rating: "perfect", strong: true }, power: 1, hit: new Set(), target: e, dir: 1 };
      g.combat._applyHit(e, act, 1, e.x, e.centerY);
      return g.combat.td ? g.combat.td.kind : null;
    }, [kind]);
    if (hold) {
      for (const h of hold) {
        await page.evaluate(h => { window.__tdHold = h; }, h[0]);
        await page.waitForFunction(h => { const c = window.__game.combat; return !c.td || c.td.t >= h; }, h[0], { timeout: 6000, polling: 10 }).catch(() => {});
        await page.screenshot({ path: path.join(shots, `kg-td-${id}-${h[1]}.png`) });
      }
      await page.evaluate(() => { window.__tdHold = null; });
    }
    await page.waitForFunction(() => !window.__game.combat.td, null, { timeout: 9000 }).catch(() => {});
    await wait(500);
    const st = await page.evaluate(() => { const g = window.__game, e = window.__tde; return { td: !!g.combat.td, state: g.player.state, scripted: g.player.scripted, alive: e.alive, ex: Math.round(e.x), px: Math.round(g.player.x), hp: Math.round(g.player.hp) }; });
    return [start, st];
  };
  for (const [gn, id, ttl] of [["sawed", "sawed_blast", "ДУПЛЕТ В УПОР"], ["revolver", "revolver_duel", "ДУЭЛЬ"]]) {
    for (const kind of ["blade", "gunner", "swift"]) {
      const holds = kind === "blade" ? (id === "sawed_blast" ? [[0.12, "dash"], [0.3, "aim"], [0.4, "blast1"], [0.62, "blast2"], [0.78, "fly"], [0.92, "reload"]] : [[0.18, "pause"], [0.36, "turn"], [0.5, "draw"], [0.58, "shot"], [0.85, "spin"], [1.08, "holster"]]) : null;
      const [start, st] = await runTd(gn, id, kind, holds);
      r = null;
      check(start === id && !st.td && st.state !== "takedown" && !st.scripted && !st.alive, `${ttl} (${kind}): запущено ${start}, завершено, герой ${st.state}, враг мёртв=${!st.alive}`);
      if (kind === "blade") console.log(`     враг отлетел до x=${st.ex} (герой ${st.px})`);
    }
    // громила — встроенное падение колосса
    const [start2, st2] = await runTd(gn, id, "brute", null);
    r = null; check(start2 === "colossus" && !st2.td && !st2.alive, `${gn}: громила — встроенное ${start2}, завершено`);
  }

  await browser.close();
  if (errors.length) { console.log("ОШИБКИ:\n" + errors.join("\n")); bad++; }
  console.log(bad ? `ПРОБЛЕМ: ${bad}` : "всё в норме");
  process.exit(bad ? 1 : 0);
})();
