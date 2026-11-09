// Наборы огнестрела, часть 2 (12k_d_guns): node tools/kit-guns2-test.js
// Автоматы: «Шквал свинца», «Карусель»; карабин: «Заряженный луч», «Удар прикладом»; пистолет: «Дабл-тап», «Вслепую».
// Каждая комбинация вызывается точными нажатиями против неподвижных врагов с большим HP; проверяются выбранный приём и попадания.
// Затем добивание каждого оружия (форсируется смертельным ударом): срабатывает, завершается, управление вернулось, враг мёртв.
// Урон за нажатие сравнивается с веером/заряженным/двойным того же оружия (по формулам defs). Скриншоты .shots/kd2-*.png.
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
  await page.evaluate(() => { const g = window.__game; g.settings.v.slowmoMode = "off"; g.settings.v.assist = true; g.startBattle("waves"); });
  await page.waitForFunction(() => window.__game.state === "battle", null, { timeout: 60000 });
  await page.evaluate(() => {
    const g = window.__game, c = g.combat;
    window.__names = []; window.__acts = []; window.__fires = [];
    const ex = c.execute.bind(c);
    c.execute = s => { const r = ex(s); if (g.player.action) { window.__names.push(g.player.action.name); window.__acts.push(g.player.action); } return r; };
    const ah = c._applyHit.bind(c);
    window.__hits = 0; window.__hitLog = [];
    c._applyHit = (e, act, ...a) => { window.__hits++; window.__hitLog.push(act.name); return ah(e, act, ...a); };
    const fi = c._fire.bind(c);
    c._fire = (p, act, n) => { window.__fires.push({ name: act.name, facing: p.facing, n }); return fi(p, act, n); };
    Object.defineProperty(g.input, "moveX", { get: () => window.__mx || 0, set() {} });
    window.__plan = [];
    const cu = g.clock.update.bind(g.clock);
    g.clock.update = (t, dt, l, pl) => {
      cu(t, dt, l, pl);
      const p = g.player;
      if (!window.__free) { p.hp = p.maxHp; p.iframes = Math.max(p.iframes, 0.2); }
      if (window.__pin) for (const e of g.enemies) { if (e.__pinx != null && !e.executed && e.alive) e.x = e.__pinx; if (!e.executed) e.vx = 0; e.attackCD = 9; }
      if (window.__pinP && g.player.alive && !g.combat.td) { p.x = 600; p.vx = 0; }
      while (window.__plan.length && t >= window.__plan[0]) { const at = window.__plan.shift(); if (t - at < 0.1) c.onAttackPress(at); }
    };
    window.__setup = (dists, opts = {}) => {
      g.waves.queue = []; g.waves.pending = []; g.waves.between = 999;
      for (const e of g.enemies) e.dead = true; g.enemies = [];
      const p = g.player; p.x = 600; p.y = 0; p.vx = 0; p.vy = 0; p.onGround = true; p.action = null; p.setState("idle"); p.facing = opts.facing || 1; p.counterT = 0;
      Object.assign(c, { comboStep: 0, lastMeleeT: -9, shotChain: 0, lastAction: null, lastActionT: -9, chain: opts.chain || 0, airChain: 0, lastPress: null, lastTdT: 99, combo: 0, kdStormT: -9, kdCarT: -9, kdBeamT: -9, kdButtT: -9 });
      for (const d of [].concat(dists)) {
        const e = g.waves.spawn(opts.kind || "blade", true);
        e.x = p.x + d; e.__pinx = e.x; e.y = 0; e.maxHp = e.hp = 1e5; e.attackCD = 99;
      }
      window.__pin = true; window.__mx = opts.mx || 0; window.__pinP = !!opts.mx;
      window.__names.length = 0; window.__acts.length = 0; window.__hits = 0; window.__hitLog = []; window.__plan.length = 0; window.__fires = [];
    };
    window.__beats = (n, off = -0.02, step = 1) => {
      const cl = g.clock, P = cl.period; let b = cl.nextBeatAfter(g.songNow, 0.9); const out = [];
      for (let i = 0; i < n; i++) { out.push(b + off); b = cl.nextBeatAfter(b, P * (step - 0.5)); }
      window.__plan.push(...out); return out;
    };
    // следующая сильная / не сильная доля после 0.9 с
    window.__beatKind = (strong) => {
      const cl = g.clock, m = cl.map; let t = cl.nextBeatAfter(g.songNow, 0.9), i = 0;
      while (i++ < 16) { const k = m.beats.findIndex(b => Math.abs(b + cl.correction - t) < 1e-3); if (k >= 0 && !!m.strong[k] === strong) break; t = cl.nextBeatAfter(t, 0.05); }
      return t;
    };
  });
  const wait = ms => page.waitForTimeout(ms);
  const done = async () => { await page.waitForFunction(() => !window.__plan.length && !window.__game.player.action && window.__game.player.onGround, null, { timeout: 9000 }).catch(() => {}); await wait(450); };
  const res = () => page.evaluate(() => ({ names: window.__names.slice(), hits: window.__hits, log: window.__hitLog.join(" "), hp: window.__game.enemies.map(e => Math.round(1e5 - e.hp)), facing: window.__game.player.facing, fires: window.__fires.slice(), px: window.__game.player.x, ex: window.__game.enemies.map(e => e.x) }));
  const use = gn => page.evaluate(gn => { window.__game.settings.v.gunWeapon = gn; window.__game.settings.v.meleeWeapon = "dagger"; }, gn);
  let bad = 0, r = null;
  const check = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg + (ok || !r ? "" : "   [" + r.log + "]")); if (!ok) bad++; };

  // ---------- урон за нажатие против веера/заряженного/двойного ----------
  const dmgs = await page.evaluate(() => {
    const out = {};
    for (const id of ["smg", "rail", "pistol"]) {
      const s = { gunWeapon: id, meleeWeapon: "dagger" }, v = n => { const d = window.weaponDefRef(n, s); return d.dmg * (d.shots || 1); };
      const refs = ["twin", "fan", "charged"].map(v);
      const mine = { smg: ["smgStorm", "smgCarousel"], rail: ["railBeam", "railButt"], pistol: ["pistolDtap", "pistolBlind"] }[id];
      out[id] = { ref: refs.reduce((a, b) => a + b, 0) / 3, mine: mine.map(n => { const d = window.ATTACKS_REF[n]; return [n, n === "railButt" ? d.dmg * 1.45 : d.dmg * (d.shots || 1)]; }), backShot: v("backShot") };
    }
    return out;
  });
  for (const id in dmgs) for (const [n, d] of dmgs[id].mine) {
    const ref = n === "pistolBlind" ? dmgs[id].backShot : dmgs[id].ref, ratio = d / ref;
    r = null; check(ratio > 0.85 && ratio < 1.2, `${n}: урон за нажатие по одной цели ${d.toFixed(1)} против ${ref.toFixed(1)} (${(ratio * 100).toFixed(0)}%)`);
  }

  // ---------- автоматы ----------
  console.log("— Парные автоматы —");
  await use("smg");
  await page.evaluate(() => { window.__setup([300, 420], { chain: 9 }); window.__plan.push(window.__beatKind(true) - 0.02); });
  await done(); r = await res();
  check(r.names[0] === "smgStorm", `Шквал свинца выбран: ${r.names.join(" → ")}`);
  check(r.hits >= 6 && r.hp.every(d => d > 0), `Шквал свинца: попаданий ${r.hits}, урон по врагам ${r.hp.join(" и ")} (очередь пронизывает обоих)`);
  await page.screenshot({ path: path.join(shots, "kd2-smg-storm.png") });
  // Карусель: враги с двух сторон
  await page.evaluate(() => { window.__setup([-260, 260]); window.__plan.push(window.__beatKind(false) - 0.02); });
  await wait(1250);
  await page.screenshot({ path: path.join(shots, "kd2-smg-carousel.png") });
  await done(); r = await res();
  check(r.names[0] === "smgCarousel", `Карусель выбрана: ${r.names.join(" → ")}`);
  check(r.hits >= 8 && r.hp.length === 2 && r.hp.every(d => d > 5), `Карусель: попаданий ${r.hits}, урон по врагам с двух сторон ${r.hp.join(" и ")}`);
  check(r.fires.some(f => f.facing === 1) && r.fires.some(f => f.facing === -1), `Карусель: передний ствол стрелял в обе стороны (разворот): ${[...new Set(r.fires.map(f => f.facing))].join(",")}`);
  // без условий — обычный выстрел
  await page.evaluate(() => { window.__setup(300); window.__beats(1, 0.2); });
  await done(); r = await res();
  check(!["smgStorm", "smgCarousel"].includes(r.names[0]), `неточное нажатие без комбинаций: ${r.names.join(" → ")}`);

  // ---------- карабин ----------
  console.log("— Рельсовый карабин —");
  await use("rail");
  await page.evaluate(() => { window.__setup([330, 460]); window.__beats(3, -0.02); });
  await wait(2050);
  await page.screenshot({ path: path.join(shots, "kd2-rail-beam.png") });
  await done(); r = await res();
  check(r.names[2] === "railBeam", `Заряженный луч — 3-й выстрел подряд: ${r.names.join(" → ")}`);
  check(r.log.split(" ").filter(x => x === "railBeam").length >= 2 && r.hp.every(d => d > 0), `Заряженный луч: бьёт обоих на линии (${r.log})`);
  // Удар прикладом: враг вплотную, герой отходит
  await page.evaluate(() => { window.__setup(28, { mx: -1 }); window.__beats(1, -0.02); });
  await wait(1250);
  await page.screenshot({ path: path.join(shots, "kd2-rail-butt.png") });
  await done(); r = await res();
  check(r.names[0] === "railButt", `Удар прикладом выбран: ${r.names.join(" → ")}`);
  check(r.log.split(" ").filter(x => x === "railButt").length >= 2, `Удар прикладом: приклад и выстрел навылет (${r.log})`);

  // ---------- пистолет ----------
  console.log("— Неоновый пистолет —");
  await use("pistol");
  await page.evaluate(() => {
    window.__setup(380); const cl = window.__game.clock, t = window.__beatKind(false);
    window.__plan.push(t - 0.02, t + cl.period / 2 - 0.02);
  });
  await done(); r = await res();
  check(r.names[1] === "pistolDtap", `Дабл-тап: ${r.names.join(" → ")}`);
  check(r.fires.filter(f => f.name === "pistolDtap").length === 2 && r.hits >= 3, `Дабл-тап: две пули, попаданий всего ${r.hits}`);
  await page.screenshot({ path: path.join(shots, "kd2-pistol-dtap.png") });
  // Вслепую: враг за спиной
  await page.evaluate(() => { window.__setup(380, { facing: -1 }); window.__beats(1, -0.02); });
  await wait(1250);
  await done(); r = await res();
  check(r.names[0] === "pistolBlind", `Вслепую выбран: ${r.names.join(" → ")}`);
  check(r.fires.length >= 1 && r.fires[0].facing === -1 && r.hits >= 1, `Вслепую: выстрел через плечо (facing ${r.fires[0] && r.fires[0].facing}), попаданий ${r.hits}, после — разворот к врагу (facing ${r.facing})`);
  check(r.facing === 1, `Вслепую: герой развернулся лицом к врагу`);
  await page.evaluate(() => { window.__setup(380, { facing: -1 }); window.__beats(1, -0.02); });
  await wait(1300);
  await page.screenshot({ path: path.join(shots, "kd2-pistol-blind.png") });
  await done();

  // ---------- добивания ----------
  console.log("— добивания —");
  const tdKinds = { smg: "smgJuggle", rail: "railPierce", pistol: "pistolTrio" };
  for (const gn of ["smg", "rail", "pistol"]) {
    await use(gn);
    for (const kind of ["blade", "gunner", "swift", "brute"]) {
      const shotsAt = kind === "blade" ? [0.2, 0.45, 0.7] : [];
      await page.evaluate(([kind]) => {
        const g = window.__game; window.__pin = false; window.__free = false;
        g.waves.queue = []; g.waves.pending = []; g.waves.between = 999; g.enemies = []; g.combat.lastTdT = -9; g.combat.td = null;
        g.player.reset(600); g.player.hp = 100;
        const e = g.waves.spawn(kind); e.x = 900; e.y = 0; e.state = "think"; e.hp = 1; e.attackCD = 99; window.__tdE = e;
        const act = { def: window.weaponDefRef("shot", g.settings.v), name: "shot", judge: { rating: "perfect", strong: true }, power: 1, hit: new Set() };
        g.combat._applyHit(e, act, 1, e.x, e.centerY);
      }, [kind]);
      const k0 = await page.evaluate(() => window.__game.combat.td && window.__game.combat.td.kind);
      for (const ms of shotsAt) { await wait(ms * 1000 - (shotsAt.indexOf(ms) ? shotsAt[shotsAt.indexOf(ms) - 1] * 1000 : 0)); await page.screenshot({ path: path.join(shots, `kd2-td-${gn}-${Math.round(ms * 100)}.png`) }); }
      await wait(2400);
      const r2 = await page.evaluate(() => { const g = window.__game; return [!!g.combat.td, g.player.state, !window.__tdE.alive, g.player.scripted, Math.round(g.player.y)]; });
      const want = kind === "brute" ? "colossus" : tdKinds[gn];
      r = null; check(k0 === want && !r2[0] && r2[2] && !r2[3] && r2[1] !== "takedown", `добивание ${k0} (${gn}, ${kind}): завершилось, враг мёртв=${r2[2]}, герой ${r2[1]}, y=${r2[4]}`);
    }
  }
  const info = await page.evaluate(() => window.__game.combat.combos);
  console.log("комбинации за прогон:", JSON.stringify(info));
  await browser.close();
  if (errors.length) { console.log("ОШИБКИ:\n" + errors.join("\n")); bad++; }
  console.log(bad ? `ПРОБЛЕМ: ${bad}` : "всё в норме");
  process.exit(bad ? 1 : 0);
})();
