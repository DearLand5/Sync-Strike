// Рукопашные удары и джагл (12f_martial.js, 12_combat launchEnemy/juggleHit/smashEnemy): node tools/martial-test.js
// 1) Каждый рукопашный приём вызывается точными нажатиями по своему условию против неподвижного врага с большим HP и попадает.
// 2) Джагл: подбив → колено → нога/клинок → Топор-кик: враг в воздухе ≥ 3 ударов, затем вбит в землю с ударной волной.
// 3) Громила не взлетает; предел джагла (не больше JUG.hits ударов и JUG.age секунд, затем падает); враги в воздухе не атакуют.
// 4) Все рукопашные приёмы с каждым видом ближнего оружия (принудительно, mForce): без ошибок, цепь кусаригамы в покое, попадания есть.
// Скриншоты: .shots/ma-*.png. Ошибки страницы — провал.
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
    window.__names = []; window.__hits = 0; window.__hitLog = []; window.__plan = []; window.__maxY = 0; window.__trace = [];
    const ex = c.execute.bind(c);
    c.execute = s => { const r = ex(s); if (g.player.action) window.__names.push(g.player.action.name); return r; };
    const ah = c._applyHit.bind(c);
    c._applyHit = (e, act, ...a) => { window.__hits++; window.__hitLog.push(act.name + ":" + (e.onGround ? "g" : "a")); return ah(e, act, ...a); };
    const cu = g.clock.update.bind(g.clock);
    g.clock.update = (t, dt, l, pl) => {
      cu(t, dt, l, pl);
      const p = g.player;
      p.hp = p.maxHp; p.iframes = Math.max(p.iframes, 0.2);
      for (const e of g.enemies) {
        if (window.__pin) { if (e.__pinx != null && !e.executed) e.x = e.__pinx; if (!window.__free) e.vx = 0; e.attackCD = 9; if (!window.__free && e.alive && e.y < 0 && e.state !== "hurt" && !e.executed) { e.y = 0; e.vy = 0; e.onGround = true; } }
        if (e.alive) window.__maxY = Math.max(window.__maxY, -e.y);
        if (e.alive && e.state === "attack" && !e.onGround) window.__airAttack = true;
      }
      while (window.__plan.length && t >= window.__plan[0]) { const at = window.__plan.shift(); if (t - at < 0.1) { if (window.__pre) { window.__pre(); window.__pre = null; } c.onAttackPress(at); } }
    };
    window.__setup = (dists, opts = {}) => {
      g.waves.queue = []; g.waves.pending = []; g.waves.between = 999;
      for (const e of g.enemies) e.dead = true; g.enemies = [];
      const p = g.player; p.x = 600; p.y = 0; p.vx = 0; p.vy = 0; p.onGround = true; p.action = null; p.scripted = false; p.setState("idle"); p.facing = opts.facing || 1; p.counterT = 0; p.pistolT = 0;
      Object.assign(c, { comboStep: 0, lastMeleeT: -9, shotChain: 0, lastAction: null, lastActionT: -9, chain: opts.chain || 0, airChain: 0, lastPress: null, lastTdT: opts.td ? -99 : 99, combo: 0, _kitT: {}, mAlt: Object.assign({}, opts.alt || {}), mForce: opts.force || null, lastRiseT: -9, juggles: 0, smashes: 0 });
      for (const d of [].concat(dists)) {
        const e = g.waves.spawn(opts.kind || "blade", true);
        e.x = p.x + d; e.__pinx = e.x; e.y = 0; e.maxHp = e.hp = opts.hp || 1e5; e.attackCD = 99; e.jugCD = 0;
      }
      window.__pin = true; window.__free = !!opts.free; window.__airAttack = false;
      window.__names.length = 0; window.__hits = 0; window.__hitLog = []; window.__plan.length = 0; window.__maxY = 0;
    };
    window.__dmg = () => g.enemies.reduce((s, e) => s + (e.maxHp - e.hp), 0);
    const strongAt = x => { const m = g.clock.map, cl = g.clock; const k = m.beats.findIndex(b => Math.abs(b + cl.correction - x) < 0.03); return k >= 0 && m.strong[k]; };
    window.__beatPair = (ahead = 1.2) => {
      const cl = g.clock; let t = cl.nextBeatAfter(g.songNow, ahead), i = 0;
      const next = x => cl.nextBeatAfter(x, 0.05);
      while (i++ < 40 && (strongAt(t) || strongAt(next(t)))) t = next(t);
      window.__pair2 = next(t);
      return t;
    };
    window.__beatTriple = (ahead = 1.0) => {
      const cl = g.clock; let t = cl.nextBeatAfter(g.songNow, ahead), i = 0;
      const next = x => cl.nextBeatAfter(x, 0.05);
      while (i++ < 60 && (strongAt(t) || strongAt(next(t)) || strongAt(next(next(t))))) t = next(t);
      return [t, next(t), next(next(t))];
    };
    window.__beatAt = (strong, ahead = 1.2) => {
      const cl = g.clock; let t = cl.nextBeatAfter(g.songNow, ahead), i = 0;
      while (i++ < 40) { if (!!strongAt(t) === strong) return t; t = cl.nextBeatAfter(t, 0.05); }
      return t;
    };
    // n последовательных долей, начиная с ближайшей сильной (через ahead)
    window.__fromStrong = (n, ahead = 1.2) => {
      const cl = g.clock; let t = window.__beatAt(true, ahead); const out = [t];
      for (let i = 1; i < n; i++) { t = cl.nextBeatAfter(t, 0.05); out.push(t); }
      return out;
    };
  });
  const wait = ms => page.waitForTimeout(ms);
  const done = async (ms = 9000) => { await page.waitForFunction(() => !window.__plan.length && !window.__game.player.action && window.__game.player.onGround, null, { timeout: ms }).catch(() => {}); await wait(450); };
  const res = () => page.evaluate(() => ({ names: window.__names.slice(), hits: window.__hits, log: window.__hitLog.join(" "), dmg: Math.round(window.__dmg()), maxY: Math.round(window.__maxY), juggles: window.__game.combat.juggles, smashes: window.__game.combat.smashes }));
  const use = id => page.evaluate(id => { window.__game.settings.v.meleeWeapon = id; }, id);
  let bad = 0, r = null;
  const check = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg + (ok || !r ? "" : "   [" + r.names.join(",") + " | " + r.log + "]")); if (!ok) bad++; };
  const shot = n => page.screenshot({ path: path.join(shots, "ma-" + n + ".png") });
  const waitAct = (name, phase, extra = 0) => page.waitForFunction(([n, ph]) => { const a = window.__game.player.action; return a && a.name === n && a.phase === ph; }, [name, phase], { timeout: 9000 }).catch(() => {}).then(() => wait(extra));

  // ---- 1) условия выбора приёмов (кинжал) ----
  console.log("— приёмы по условиям (кинжал) —");
  await use("dagger");
  // Фронт-кик: второй удар серии в такт (не на сильной доле)
  await page.evaluate(() => { window.__setup(36); const t = window.__beatPair(1.0), t2 = window.__pair2; window.__plan.push(t - 0.02, t2 - 0.02); });
  await waitAct("kickFront", "active", 20); await shot("kickfront");
  await done(); r = await res();
  check(r.names.join(",") === "slash1,kickFront", `Фронт-кик: ${r.names.join(" → ")}`);
  check(r.log.includes("kickFront"), `Фронт-кик: попал, урон ${r.dmg}`);
  // Вертушка: два удара в такт и третий на сильной доле
  await page.evaluate(() => { window.__setup(28); const ts = window.__beatAt(true, 1.8), P = window.__game.clock.period; window.__plan.push(ts - 2 * P - 0.02, ts - P - 0.02, ts - 0.02); });
  await waitAct("roundKick", "active", 30); await shot("roundkick");
  await done(); r = await res();
  check(r.names[2] === "roundKick" && r.names.length === 3, `Вертушка: ${r.names.join(" → ")}`);
  check(r.log.includes("roundKick"), `Вертушка: попала (${r.log})`);
  // Подбив: то же, но чередование выбрало подброс
  await page.evaluate(() => { window.__setup(28, { alt: { strong3: 1 } }); const ts = window.__beatAt(true, 1.8), P = window.__game.clock.period; window.__plan.push(ts - 2 * P - 0.02, ts - P - 0.02, ts - 0.02); });
  await waitAct("liftKick", "active", 30); await shot("liftkick");
  await done(); r = await res();
  check(r.names[2] === "liftKick", `Подбив: ${r.names.join(" → ")}`);
  check(r.juggles >= 1 && r.maxY >= 40, `Подбив: враг подброшен (подбросов ${r.juggles}, высота ${r.maxY})`);
  // Колено вплотную: после удара в долю
  await page.evaluate(() => { window.__setup(24); const t = window.__beatPair(1.0), t2 = window.__pair2; window.__plan.push(t - 0.02, t2 - 0.02); });
  await waitAct("kneeStrike", "active", 30); await shot("knee");
  await done(); r = await res();
  check(r.names[1] === "kneeStrike", `Колено: ${r.names.join(" → ")}`);
  check(r.log.includes("kneeStrike"), `Колено: попало (${r.log})`);
  // Локоть вплотную после серии: клинок → фронт-кик (шаг 2) → локоть
  await page.evaluate(() => { window.__setup(36, { alt: { step2: 1 } }); const [a, b, c] = window.__beatTriple(1.0); window.__plan.push(a - 0.02, b - 0.02, c - 0.02); });
  await waitAct("elbow", "active", 30); await shot("elbow");
  await done(); r = await res();
  check(r.names.join(",") === "slash1,kickFront,elbow", `Локоть вплотную после серии: ${r.names.join(" → ")}`);
  check(r.log.includes("elbow"), `Локоть: попал (${r.log})`);
  // Локоть с разворота: враг за спиной
  await page.evaluate(() => { window.__setup(-28); window.__plan.push(window.__beatAt(false, 1.0) - 0.02); });
  await waitAct("elbowSpin", "active", 30); await shot("elbowspin");
  await done(); r = await res();
  check(r.names[0] === "elbowSpin" && r.log.includes("elbowSpin"), `Локоть с разворота: ${r.names.join(" → ")}; ${r.log}`);
  // Подсечка: враг в замахе
  await page.evaluate(() => { window.__setup(28); const e = window.__game.enemies[0]; e.state = "windup"; e.windT = 0; e.windDur = 99; window.__plan.push(window.__beatAt(false, 1.0) - 0.02); });
  await waitAct("sweepKick", "active", 30); await shot("sweep");
  await done(); r = await res();
  check(r.names[0] === "sweepKick" && r.log.includes("sweepKick"), `Подсечка: ${r.names.join(" → ")}; ${r.log}`);
  check(await page.evaluate(() => window.__game.enemies[0].state !== "windup"), "Подсечка: замах сбит");
  // Двойной удар ногами: рывок вместо «Рывка» на средней дистанции
  await page.evaluate(() => { window.__setup(110); window.__plan.push(window.__beatAt(false, 1.0) - 0.09); });
  await waitAct("dropKick", "active", 60); await shot("dropkick");
  await done(); r = await res();
  check(r.names[0] === "dropKick" && r.log.includes("dropKick"), `Двойной удар ногами: ${r.names.join(" → ")}; ${r.log}`);

  // ---- 2) джагл ----
  console.log("— джагл: подбив → удары в воздухе → Топор-кик —");
  await page.evaluate(() => {
    window.__setup(28, { alt: { strong3: 1 }, free: true });
    const cl = window.__game.clock, P = cl.period;
    const ts = window.__beatAt(true, 2.0);
    // два удара в такт, подбив на сильной доле, затем удары на каждой доле
    const plan = [ts - 2 * P - 0.02, ts - P - 0.02, ts - 0.02];
    let t = ts; for (let i = 0; i < 4; i++) { t = cl.nextBeatAfter(t, 0.05); plan.push(t - 0.02); }
    window.__plan.push(...plan);
    window.__jug = { max: 0, minAfter: 0 };
  });
  await waitAct("airKnee", "active", 30); await shot("juggle-knee");
  await waitAct("axeKick", "active", 30); await shot("juggle-axe");
  await waitAct("axeKick", "recovery", 0); await shot("juggle-slam");
  await done(); r = await res();
  const air = (r.log.match(/:a/g) || []).length;
  check(r.names[2] === "liftKick", `Джагл: начало ${r.names.slice(0, 3).join(" → ")}`);
  check(r.names.includes("airKnee") && r.names.includes("axeKick"), `Джагл: колено в воздухе и Топор-кик в серии: ${r.names.join(" → ")}`);
  check(air >= 3, `Джагл: попаданий по врагу в воздухе ${air} (≥ 3: ${r.log})`);
  check(r.smashes >= 1, `Джагл: враг вбит в землю (вбиваний ${r.smashes})`);
  check(await page.evaluate(() => { const e = window.__game.enemies[0]; return !e || !e.alive || (e.onGround && e.jugT === 0 && e.jugN === 0); }), "Джагл: после приземления враг сброшен в норму");
  check(r.dmg > 60, `Джагл: общий урон ${r.dmg}`);

  // предел джагла: подбросить и бить без остановки — враг обязан упасть, воздушных ударов ≤ 6, полёт ≤ ~3 с
  await page.evaluate(() => {
    window.__setup(20, { free: true }); const g = window.__game, c = g.combat, e = g.enemies[0]; window.__free = true; window.__pin = false;
    e.attackCD = 99; c.launchEnemy(e, 1); window.__lim = { t0: g.songNow, land: null, hits: 0, jug: 0 };
    window.__limIv = setInterval(() => { if (e.jugT > 0 && !e.onGround) { c.juggleHit(e, 1); window.__lim.hits++; window.__lim.jug = Math.max(window.__lim.jug, e.jugN); } if (e.onGround && window.__lim.land == null && e.jugAge === 0 && window.__lim.hits > 0) window.__lim.land = g.songNow - window.__lim.t0; }, 120);
  });
  await wait(5200);
  const lim = await page.evaluate(() => { clearInterval(window.__limIv); const e = window.__game.enemies[0]; return Object.assign({}, window.__lim, { onGround: e.onGround, jugT: e.jugT, jugN: e.jugN, state: e.state }); });
  r = null;
  check(lim.onGround && lim.land != null && lim.land < 3.4, `Предел джагла: враг приземлился через ${lim.land == null ? "—" : lim.land.toFixed(2)} с (≤ 3,4), воздушных ударов ${lim.hits}`);
  check(lim.jug <= 6, `Предел джагла: счётчик воздушных ударов ${lim.jug} ≤ 6`);
  // откат: сразу после приземления повторный подброс с земли не проходит
  const relaunch = await page.evaluate(() => { const g = window.__game, c = g.combat, e = g.enemies[0]; e.onGround = true; e.y = 0; e.jugCD = 1.4; return c.launchEnemy(e, 1); });
  check(relaunch === false, "Откат: сразу после приземления повторный подброс не проходит");
  // громила: не подбрасывается
  await page.evaluate(() => { window.__setup(28, { kind: "brute", free: false }); const c = window.__game.combat, e = window.__game.enemies[0]; window.__brute = c.launchEnemy(e, 1); window.__plan.push(window.__beatAt(true, 1.0) - 0.02); });
  await done(); r = await res();
  check(await page.evaluate(() => window.__brute === false), "Громила: launchEnemy отказывает");
  check(r.maxY < 8, `Громила: не взлетает (макс. высота ${r.maxY}), приёмы: ${r.names.join(" → ")}`);
  // враг в замахе (суперброня) не подбрасывается
  await page.evaluate(() => { window.__setup(28); const e = window.__game.enemies[0]; e.state = "attack"; window.__armed = window.__game.combat.launchEnemy(e, 1); });
  check(await page.evaluate(() => window.__armed === false), "Враг в ударе (суперброня): подброс не проходит");
  // враги в воздухе не атакуют
  check(await page.evaluate(() => !window.__airAttack), "Враги в воздухе не переходили в состояние атаки");

  // ---- 3) все приёмы со всеми видами ближнего оружия ----
  console.log("— каждый приём с каждым оружием (принудительно) —");
  const weapons = await page.evaluate(() => Object.keys(window.WEAPONS_REF).filter(k => window.WEAPONS_REF[k].slot === "melee"));
  const ground = ["kickFront", "roundKick", "liftKick", "kneeStrike", "elbow", "elbowSpin", "sweepKick", "dropKick"];
  for (const w of weapons) {
    await use(w);
    const bits = [];
    for (const mv of ground) {
      let chainRest = true;
      for (let attempt = 0; attempt < 2; attempt++) {     // нажатие в редких случаях теряется на загруженном кадре — одна повторная попытка
      await page.evaluate(([mv]) => {
        const dist = mv === "dropKick" ? 90 : mv === "elbowSpin" ? -26 : mv === "elbow" || mv === "kneeStrike" ? 24 : 28;
        window.__setup(dist, { force: mv, free: false });
        const g = window.__game; g.player.wExt = 0;
        window.__plan.push(window.__beatAt(false, 1.0) - 0.02);
      }, [mv]);
      await waitAct(mv, "active", 15);
      chainRest = await page.evaluate(() => !window.__game.player.wExt);
      await done(); r = await res();
      if (r.names.length) break;
      }
      const okName = r.names[0] === mv, okHit = r.log.includes(mv);
      if (!okName || !okHit || !chainRest) { check(false, `${w}: ${mv} (приём ${r.names[0]}, попадание ${okHit}, цепь в покое ${chainRest})`); }
      else bits.push(mv);
    }
    check(bits.length === ground.length, `${w}: ${bits.length}/${ground.length} наземных приёмов попали`);
    if (w === "kusari" || w === "axe") await shot("weapon-" + w);
  }
  // воздушные приёмы с каждым оружием: висящий враг, герой в воздухе
  for (const w of weapons) {
    await use(w);
    const outs = [];
    for (const mv of ["airKnee", "airKick", "axeKick"]) {
      await page.evaluate(([mv]) => {
        window.__setup(24, { force: mv, free: true }); const g = window.__game, c = g.combat, e = g.enemies[0], p = g.player;
        window.__pin = false;
        // в момент нажатия: враг висит на высоте, герой в воздухе рядом (как посреди джагла)
        window.__pre = () => {
          e.y = -50; e.vy = 0; e.onGround = false; e.state = "hurt"; e.hurtDur = 9; e.jugT = 1.2; e.jugN = 3; e.jugAge = 0.2; e.x = p.x + 24; e.vx = 0;
          p.y = -50; p.vy = 0; p.onGround = false; p.state = "fall"; p.vx = 0;
        };
        window.__plan.push(g.clock.nextBeatAfter(g.songNow, 0.4) - 0.02);
      }, [mv]);
      await done(7000); r = await res();
      outs.push(r.names[0] === mv && r.log.includes(mv));
    }
    check(outs.every(Boolean), `${w}: воздушные приёмы (колено ${outs[0]}, нога ${outs[1]}, топор-кик ${outs[2]})`);
  }

  console.log(errors.length ? "ОШИБКИ СТРАНИЦЫ:\n" + errors.join("\n") : "без ошибок страницы");
  if (errors.length) bad++;
  console.log(bad ? `ПРОВАЛОВ: ${bad}` : "всё в порядке");
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
