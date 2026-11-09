// Оружие игрока («Арсенал»): node tools/weapons-test.js
// Для каждого оружия ближнего боя: Крест (4 удара в такт), Шквал, Ответ, Сквозной рывок, дальность достижения, удар в долю (act.onBeat),
// урон за нажатие относительно кинжала. Для каждого огнестрела: выстрелы издалека и вблизи, Веер/Двойной, дробь (число попавших дробин
// зависит от дистанции), очередь (3 пули, комбо растёт один раз), пробивание нескольких врагов; урон за нажатие относительно пистолета.
// Плюс: выбор сохраняется после перезагрузки, неизвестный id → базовое. Ошибки страницы — провал.
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
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
    window.__names = []; window.__acts = [];
    const ex = c.execute.bind(c);
    c.execute = s => { const r = ex(s); if (g.player.action) { window.__names.push(g.player.action.name); window.__acts.push(g.player.action); } return r; };
    const ah = c._applyHit.bind(c);
    window.__hits = 0; window.__hitLog = [];
    c._applyHit = (e, act, ...a) => { window.__hits++; window.__hitLog.push(act.name + ":" + (act.sub || 0) + (act.dmgK && act.dmgK < 1 ? "/" + act.dmgK.toFixed(2) : "")); return ah(e, act, ...a); };
    window.__plan = [];
    const cu = g.clock.update.bind(g.clock);
    g.clock.update = (t, dt, l, pl) => {
      cu(t, dt, l, pl);
      const p = g.player;
      p.hp = p.maxHp; p.iframes = Math.max(p.iframes, 0.2);
      if (window.__pin) for (const e of g.enemies) { if (e.__pinx != null) e.x = e.__pinx; e.vx = 0; e.attackCD = 9; }
      while (window.__plan.length && t >= window.__plan[0]) { const at = window.__plan.shift(); if (t - at < 0.1) c.onAttackPress(at); }
    };
    // dists — расстояния врагов от героя (несколько — враги по линии); HP огромный, чтобы не было добиваний
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
      window.__names.length = 0; window.__acts.length = 0; window.__hits = 0; window.__hitLog = []; window.__plan.length = 0;
    };
    window.__dmg = () => g.enemies.reduce((s, e) => s + (1e5 - e.hp), 0);
    // как __beats, но начало серии — на не-сильной доле, и вторая тоже не сильная (иначе вместо удара выйдет подброс)
    window.__beatsNS = (n, off = -0.02) => {
      const cl = g.clock, m = cl.map, P = cl.period;
      let t = cl.nextBeatAfter(g.songNow, 0.9), i = 0;
      const strongAt = x => { const k = m.beats.findIndex(b => Math.abs(b + cl.correction - x) < 1e-3); return k >= 0 && m.strong[k]; };
      while (i++ < 12 && (strongAt(t) || strongAt(t + P))) t = cl.nextBeatAfter(t, 0.05);
      for (let k = 0; k < n; k++) { window.__plan.push(t + off); t = cl.nextBeatAfter(t, P * 0.5); }
    };
    window.__beats = (n, off = -0.02, step = 1, half = []) => {
      const cl = g.clock, P = cl.period;
      let b = cl.nextBeatAfter(g.songNow, 0.9);
      const out = [];
      for (let i = 0; i < n; i++) { out.push(b + off); if (half.includes(i)) out.push(b + P / 2 + off); b = cl.nextBeatAfter(b, P * (step - 0.5)); }
      window.__plan.push(...out);
      return out;
    };
  });
  const wait = ms => page.waitForTimeout(ms);
  const done = async () => { await page.waitForFunction(() => !window.__plan.length && !window.__game.player.action && window.__game.player.onGround, null, { timeout: 9000 }).catch(() => {}); await wait(300); };
  const res = () => page.evaluate(() => ({ names: window.__names.slice(), hits: window.__hits, log: window.__hitLog.join(" "), dmg: window.__dmg(), combo: window.__game.combat.combo, onBeat: window.__acts.filter(a => a.onBeat).length, acts: window.__acts.length, hp: window.__game.enemies.map(e => Math.round(1e5 - e.hp)) }));
  const use = (m, gn) => page.evaluate(([m, gn]) => { const g = window.__game; g.settings.v.meleeWeapon = m; g.settings.v.gunWeapon = gn; }, [m, gn]);
  let bad = 0, r = null;
  const check = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg + (ok || !r ? "" : "   [попадания: " + r.log + "]")); if (!ok) bad++; };
  const ids = await page.evaluate(() => Object.keys(window.WEAPONS_REF).map(k => [k, window.WEAPONS_REF[k].slot]));
  const base = {};

  console.log("— ближний бой —");
  for (const [id] of ids.filter(x => x[1] === "melee")) {
    await use(id, "pistol");
    const nm = await page.evaluate(id => window.WEAPONS_REF[id].name, id);
    // 1) серия: Крест на 4-м ударе, урон за нажатие
    await page.evaluate(() => { window.__setup(28); window.__beatsNS(4); });
    await done(); r = await res();
    if (id === "dagger") base.melee = r.dmg;
    check(r.names.join(",") === "slash1,slash2,slash3,cross", `${nm}: серия ${r.names.join(" → ")}`);
    check(r.hits >= 5, `${nm}: попаданий ${r.hits} (≥ 5)`);
    check(r.onBeat >= 3, `${nm}: ударов в долю ${r.onBeat} из ${r.acts} (≥ 3)`);
    const ratio = r.dmg / base.melee;
    console.log(`     урон за серию из 4 нажатий: ${Math.round(r.dmg)} (${(ratio * 100).toFixed(0)}% кинжала)`);
    check(ratio > 0.7 && ratio < 1.6, `${nm}: урон серии в пределах 70–160% кинжала`);
    // 2) Шквал
    await page.evaluate(() => {
      const g = window.__game; window.__setup(28);
      const cl = g.clock, m = cl.map; let t = cl.nextBeatAfter(g.songNow, 0.9), i = 0;
      while (i++ < 8) { const k = m.beats.findIndex(b => Math.abs(b + cl.correction - t) < 1e-3); if (k >= 0 && !m.strong[k]) break; t = cl.nextBeatAfter(t, 0.05); }
      window.__plan.push(t - 0.02, t + cl.period / 2 - 0.02);
    });
    await done(); r = await res();
    // свои подмены «Шквала»: у глефы «Пропеллер», у катаны «Ласточка» (2 разреза); у кусаригамы вместо «Сквозного рывка» — «Обмотка»/«Маятник»
    check(id === "katana" ? r.names[1] === "katanaSwallow" && r.hits >= 3 : (r.names[1] === "flurry" || (id === "glaive" && r.names[1] === "glaive_prop")) && r.hits >= 4, `${nm}: Шквал ${r.names.join(" → ")}, попаданий ${r.hits}`);
    // 3) Ответ
    await page.evaluate(() => { window.__setup(30); window.__beats(1); setTimeout(() => { window.__game.player.counterT = 1; }, 700); });
    await done(); r = await res();
    check((r.names[0] === "riposte" || (id === "spear" && r.names[0] === "spear_counter")) && r.hits >= 1, `${nm}: Ответ ${r.names.join(" → ")}, попаданий ${r.hits}`);
    // 4) Сквозной рывок
    await page.evaluate(() => {
      const g = window.__game; window.__setup(140, { chain: 9 });
      const cl = g.clock, m = cl.map; let t = cl.nextBeatAfter(g.songNow, 0.9), i = 0;
      while (i++ < 16) { const k = m.beats.findIndex(b => Math.abs(b + cl.correction - t) < 1e-3); if (k >= 0 && m.strong[k]) break; t = cl.nextBeatAfter(t, 0.05); }
      window.__plan.push(t - 0.02);
    });
    await done(); r = await res();
    check((id === "kusari" ? ["kusariWrap", "kusariPendulum"].includes(r.names[0]) : r.names[0] === "pierce") && r.hits >= 2, `${nm}: Сквозной рывок ${r.names.join(" → ")}, попаданий ${r.hits}`);
    // 5) Метеор в воздухе
    await page.evaluate(() => {
      const g = window.__game, p = g.player; window.__setup(40);
      const at = window.__beats(1)[0];
      setTimeout(() => { p.y = -170; p.vy = -60; p.onGround = false; p.setState("jump"); g.combat.airChain = 2; }, Math.max(0, (at - g.songNow - 0.2) * 1000));
    });
    await done(); r = await res();
    check(r.names[0] === "meteor", `${nm}: Метеор выбран (${r.names.join(" → ")}), попаданий ${r.hits}`);
    // 6) дальность: удар по врагу чуть дальше досягаемости кинжала (разрыв ~32 ед. между телами)
    await page.evaluate(() => { window.__setup(64); window.__beats(1); });
    await done(); r = await res();
    console.log(`     враг на дистанции 64: ${r.names.join(",")} → попаданий ${r.hits}`);
  }

  console.log("— огнестрел —");
  for (const [id] of ids.filter(x => x[1] === "gun")) {
    await use("dagger", id);
    const nm = await page.evaluate(id => window.WEAPONS_REF[id].name, id);
    // 1) 4 выстрела издалека в такт (с подгонкой): урон за нажатие
    await page.evaluate(() => { window.__setup(380); window.__beats(5, -0.02); });
    await done(); await wait(600); r = await res();
    if (id === "pistol") base.gun = r.dmg;
    // приёмы набора этого оружия (12k_*) законно подменяют общие: «Заряженный луч» карабина вместо Веера и т.п.
    const own = await page.evaluate(id => Object.keys(window.ATTACKS_REF).filter(n => window.ATTACKS_REF[n].kit === id), id);
    check(r.hits >= 1 && r.names.every(n => ["shot", "twin", "fan", "charged", "hip"].includes(n) || own.includes(n)), `${nm}: выстрелы ${r.names.join(" → ")}, попаданий ${r.hits}`);
    check(r.names.includes("fan") || r.names.some(n => own.includes(n)), `${nm}: Веер или своя комбинация появились (${r.names.join(",")})`);
    check(r.onBeat >= 3, `${nm}: выстрелов в долю ${r.onBeat} из ${r.acts} (≥ 3)`);
    const ratio = r.dmg / base.gun;
    console.log(`     урон за 5 нажатий на дистанции 380: ${Math.round(r.dmg)} (${(ratio * 100).toFixed(0)}% пистолета)`);
    check(ratio > 0.5 && ratio < 1.8, `${nm}: урон в пределах 50–180% пистолета`);
    // 2) дальность 200 (ср. дистанция выстрелов), каждый выстрел по отдельности (не в такт, чтобы не было Веера)
    await page.evaluate(() => { window.__setup(230); window.__beats(1, -0.02); });
    await done(); await wait(300); r = await res();
    console.log(`     дистанция 230, один выстрел: ${r.names.join(",")} → урон ${Math.round(r.dmg)}, ${r.log}`);
    const near = r.dmg;
    await page.evaluate(() => { window.__setup(480); window.__beats(1, -0.02); });
    await done(); await wait(500); const far = await res();
    console.log(`     дистанция 480, один выстрел: ${far.names.join(",")} → урон ${Math.round(far.dmg)}, ${far.log}`);
    check(near > 0 && far.dmg > 0, `${nm}: выстрел достаёт и на 230, и на 480`);
    if (id === "sawed") {
      check(far.dmg < near, `${nm}: на 480 урон (${Math.round(far.dmg)}) меньше, чем на 230 (${Math.round(near)})`);
      check(near > 0 && r.log.includes("/") , `${nm}: дробь — один удар с долей попавших дробин (${r.log})`);
    }
    // 3) очередь: пули, комбо один раз за нажатие
    if (id === "smg") {
      await page.evaluate(() => { window.__setup(250); window.__beats(1, -0.02); });
      await done(); r = await res();
      check(r.hits >= 3 && r.combo <= 1, `${nm}: очередь — попаданий ${r.hits}, комбо ${r.combo} (комбо растёт один раз)`);
    }
    // 4) пробивание: два врага на линии
    if (id === "rail") {
      await page.evaluate(() => { window.__setup([260, 330]); window.__beats(1, -0.02); });
      await done(); r = await res();
      check(r.hp.length === 2 && r.hp.every(d => d > 0), `${nm}: пробил обоих врагов на линии (урон ${r.hp.join(" и ")})`);
    }
    // 5) вблизи: отход-выстрел, воздух
    await page.evaluate(() => { window.__setup(28); window.__beats(2, -0.02); });
    await done(); r = await res();
    console.log(`     вплотную: ${r.names.join(",")} (ближний приём — кинжал)`);
  }

  // добивания с разным оружием не зависают (4 вида: xcut, volley, sky, colossus)
  for (const [m, gn] of [["spear", "sawed"], ["kusari", "smg"], ["axe", "rail"], ["glaive", "revolver"]]) {
    await use(m, gn);
    for (const [kind, atk] of [["blade", "slash1"], ["gunner", "shot"], ["swift", "rise"], ["brute", "slash1"]]) {
      const r2 = await page.evaluate(async ([kind, atk]) => {
        const g = window.__game; g.waves.queue = []; g.waves.between = 999; g.enemies = []; g.combat.lastTdT = -9; window.__pin = false;
        g.player.reset(600); g.player.hp = 100;
        const e = g.waves.spawn(kind); e.x = atk === "shot" ? 800 : 630; e.state = "think"; e.hp = 1;
        const act = { def: window.weaponDefRef(atk, g.settings.v), name: atk, judge: { rating: "perfect", strong: true }, power: 1, hit: new Set() };
        g.combat._applyHit(e, act, 1, e.x, e.centerY);
        const td = g.combat.td && g.combat.td.kind;
        await new Promise(r => setTimeout(r, 2600));
        return [td, !!g.combat.td, g.player.state];
      }, [kind, atk]);
      r = null; check(r2[0] && !r2[1], `добивание ${r2[0]} (${m}+${gn}, ${kind}): завершилось, герой ${r2[2]}`);
    }
  }

  // выбор: сохранение, неизвестный id → базовое
  await page.evaluate(() => { const g = window.__game; g.settings.set("meleeWeapon", "katana"); g.settings.set("gunWeapon", "rail"); });
  await page.reload(); await page.waitForTimeout(500);
  const after = await page.evaluate(() => { const g = window.__game; return [g.settings.v.meleeWeapon, g.settings.v.gunWeapon]; });
  r = null; check(after.join() === "katana,rail", `выбор сохранён после перезагрузки: ${after.join(", ")}`);
  const fb = await page.evaluate(() => { const s = { meleeWeapon: "zzz", gunWeapon: "katana" }; return [window.weaponDefRef("slash1", s).name, window.weaponDefRef("shot", s).name]; });
  check(fb.join() === "Теневой кинжал,Неоновый пистолет", `неизвестный id → базовое: ${fb.join(", ")}`);
  // бой с катаной и рельсой идёт без ошибок (≈ 6 с автоигры)
  await page.evaluate(() => { const g = window.__game; g.startBattle("waves"); });
  await page.waitForFunction(() => window.__game.state === "battle", null, { timeout: 60000 });
  for (let i = 0; i < 10; i++) { await page.keyboard.press("KeyJ"); await wait(300); await page.keyboard.press("KeyD"); }
  const w = await page.evaluate(() => window.__game.player.weapon);
  console.log("герой держит:", w);
  await browser.close();
  if (errors.length) { console.log("ОШИБКИ:\n" + errors.join("\n")); bad++; }
  console.log(bad ? `ПРОБЛЕМ: ${bad}` : "всё в норме");
  process.exit(bad ? 1 : 0);
})();
