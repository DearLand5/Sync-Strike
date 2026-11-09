// Наборы клинков (12k_b_blades): node tools/kit-blades-test.js
// Для kusari/katana/dagger: каждая своя комбинация вызывается точными нажатиями против неподвижного врага с большим HP
// (выбран нужный приём, попадания есть, эффекты приёма сработали), своё добивание срабатывает, завершается, управление
// возвращается, враг умирает. Скриншоты середины добиваний — .shots/kit-td-*.png. Ошибки страницы — провал.
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
  await page.evaluate(() => { const g = window.__game; g.settings.v.slowmoMode = "off"; g.startBattle("waves"); });
  await page.waitForFunction(() => window.__game.state === "battle", null, { timeout: 60000 });
  await page.evaluate(() => {
    const g = window.__game, c = g.combat;
    window.__names = []; window.__hits = 0; window.__hitLog = [];
    const ex = c.execute.bind(c);
    c.execute = s => { const r = ex(s); if (g.player.action) window.__names.push(g.player.action.name); return r; };
    const ah = c._applyHit.bind(c);
    c._applyHit = (e, act, ...a) => { window.__hits++; window.__hitLog.push(act.name); return ah(e, act, ...a); };
    const ch = c.chooseAttack.bind(c);
    c.chooseAttack = (t, j) => { if (window.__recent) c.lastActionT = c.time - 0.2; return ch(t, j); };
    window.__plan = [];
    const cu = g.clock.update.bind(g.clock);
    g.clock.update = (t, dt, l, pl) => {
      cu(t, dt, l, pl);
      const p = g.player;
      p.hp = p.maxHp; p.iframes = Math.max(p.iframes, 0.2);
      if (window.__pin) for (const e of g.enemies) { if (!window.__free) e.x = window.__pin.x; e.vx = 0; e.attackCD = 9; if (e.alive && e.y < 0 && e.state !== "hurt") { e.y = 0; e.vy = 0; e.onGround = true; } }
      while (window.__plan.length && t >= window.__plan[0]) { const at = window.__plan.shift(); if (t - at < 0.03) c.onAttackPress(at); }
    };
    window.__setup = (dist, opts = {}) => {
      g.waves.queue = []; g.waves.pending = []; g.waves.between = 999;
      for (const e of g.enemies) e.dead = true; g.enemies = [];
      const p = g.player; p.x = 600; p.y = 0; p.vx = 0; p.vy = 0; p.onGround = true; p.action = null; p.setState("idle"); p.facing = 1; p.counterT = 0;
      Object.assign(c, { comboStep: 0, lastMeleeT: -9, lastRiseT: -9, shotChain: 0, lastAction: null, lastActionT: -9, chain: opts.chain || 0, airChain: 0, lastPress: null, lastTdT: 99, kbGrabT: -9, kbDagT: -9, kuWrapT: -9, kuPendT: -9, kuReapT: -9 });
      const e = g.waves.spawn(opts.kind || "blade", true);
      e.x = p.x + dist; e.y = 0; e.maxHp = e.hp = 1e5; e.attackCD = 99;
      window.__pin = { x: e.x }; window.__free = !!opts.free; window.__recent = !!opts.recent;
      window.__names.length = 0; window.__hits = 0; window.__hitLog = []; window.__plan.length = 0;
      return e;
    };
    // нажатие на ближайшей доле (strong: true — на сильной, false — на не сильной), со сдвигом off
    window.__beat = (strong, off = -0.02) => {
      const cl = g.clock, m = cl.map; let t = cl.nextBeatAfter(g.songNow, 0.9), i = 0;
      while (i++ < 20) { const k = m.beats.findIndex(b => Math.abs(b + cl.correction - t) < 1e-3); if (k >= 0 && !!m.strong[k] === strong) break; t = cl.nextBeatAfter(t, 0.05); }
      window.__plan.push(t + off); return t;
    };
  });
  const wait = ms => page.waitForTimeout(ms);
  const done = async () => { await page.waitForFunction(() => !window.__plan.length && !window.__game.player.action && window.__game.player.onGround, null, { timeout: 9000 }).catch(() => {}); await wait(350); };
  const res = () => page.evaluate(() => ({ names: window.__names.slice(), hits: window.__hits, log: window.__hitLog.join(" "), px: window.__game.player.x, ex: window.__game.enemies[0] && window.__game.enemies[0].x, dmg: window.__game.enemies[0] ? 1e5 - window.__game.enemies[0].hp : 0, combos: Object.assign({}, window.__game.combat.combos) }));
  const use = w => page.evaluate(w => { window.__game.settings.v.meleeWeapon = w; }, w);
  let bad = 0, r = null;
  const check = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg + (ok || !r ? "" : "   [попадания: " + r.log + "]")); if (!ok) bad++; };

  console.log("— Цепной серп —");
  await use("kusari");
  // дальний удар вместо рывка: груз летит с места и бьёт по линии цепи (цель на средней дистанции, точность не «perfect»-вдали)
  await page.evaluate(() => { window.__setup(80, { free: true }); window.__beat(false); });
  await done(); r = await res();
  check(r.names[0] === "kusariLash" && r.hits >= 1, `Бросок груза: ${r.names.join(" → ")}, попаданий ${r.hits}`);
  check(Math.abs(r.px - 600) < 40, `Бросок груза: герой почти не сдвинулся (${Math.round(r.px - 600)})`);
  console.log(`     урон ${Math.round(r.dmg)}`);
  // цепь бьёт и далеко: цель на дистанции ~160 (раньше — рывок к цели)
  await page.evaluate(() => { window.__setup(185, { free: true }); window.__beat(false, 0.01); window.__game.combat.kbGrabT = 1e9; });
  await done(); r = await res();
  check(r.names[0] === "kusariLash" && r.hits >= 1, `Бросок груза издалека: ${r.names.join(" → ")}, попаданий ${r.hits}, герой сдвинулся на ${Math.round(r.px - 600)}`);
  await page.evaluate(() => { window.__setup(130, { free: true }); window.__beat(false); });
  await done(); r = await res();
  check(r.names[0] === "kusariGrab" && r.hits >= 1, `Цепной захват: ${r.names.join(" → ")}, попаданий ${r.hits}`);
  check(r.ex - r.px < 60, `Цепной захват: враг притянут к герою (расстояние ${Math.round(r.ex - r.px)})`);
  console.log(`     урон ${Math.round(r.dmg)}`);
  await page.evaluate(() => { window.__setup(110, { free: true }); window.__beat(true); });
  await done(); r = await res();
  check(r.names[0] === "kusariWrap" && r.hits >= 2, `Обмотка: ${r.names.join(" → ")}, попаданий ${r.hits}`);
  check(r.ex < r.px, `Обмотка: враг переброшен за спину героя (${Math.round(r.ex)} < ${Math.round(r.px)})`);
  console.log(`     урон ${Math.round(r.dmg)}`);
  await page.evaluate(() => { window.__setup(120); window.__game.combat.kuWrapT = 1e9; window.__beat(true); });
  await done(); r = await res();
  check(r.names[0] === "kusariPendulum" && r.hits >= 1, `Маятник: ${r.names.join(" → ")}, попаданий ${r.hits}`);
  console.log(`     урон ${Math.round(r.dmg)}`);
  await page.evaluate(() => { window.__setup(28); window.__beat(true); });
  await done(); r = await res();
  check(r.names[0] === "kusariWhirl" && r.hits >= 3, `Вихрь цепи: ${r.names.join(" → ")}, попаданий ${r.hits}`);
  console.log(`     урон ${Math.round(r.dmg)}`);

  // «и» после удара в долю — двойной хлёст грузом (вместо «Шквала»)
  await page.evaluate(() => { window.__setup(60); const g = window.__game, t = window.__beat(false); window.__plan.push(t + g.clock.period / 2 - 0.02); });
  await done(); r = await res();
  check(r.names[1] === "kusariCrack" && r.log.split(" ").filter(n => n === "kusariCrack").length >= 2, `Двойной хлёст: ${r.names.join(" → ")}, попаданий ${r.hits}`);
  // сильная доля, впереди двое — «Жнец» подсекает обоих
  await page.evaluate(() => {
    const g = window.__game, e = window.__setup(85, { free: true }), e2 = g.waves.spawn("blade", true);
    e2.x = e.x + 45; e2.y = 0; e2.maxHp = e2.hp = 1e5; e2.attackCD = 99; window.__e2 = e2; window.__beat(true);
  });
  await done(); r = await res();
  const reap = r.log.split(" ").filter(n => n === "kusariReap").length;
  check(r.names[0] === "kusariReap" && reap >= 2, `Жнец: ${r.names.join(" → ")}, подсечено ${reap}`);

  console.log("— Багровая катана —");
  await use("katana");
  await page.evaluate(() => { window.__setup(90); window.__beat(true); });
  await done(); await wait(300); r = await res();
  check(r.names[0] === "katanaIai" && r.hits === 1 && r.px > 600 + 90, `Иай: ${r.names.join(" → ")}, герой за врагом (${Math.round(r.px)}), удар-щелчок ×${r.hits}`);
  console.log(`     урон ${Math.round(r.dmg)}`);
  await page.evaluate(() => { window.__setup(28, { recent: true }); window.__beat(true); });
  await done(); r = await res();
  check(r.names[0] === "katanaPetals" && r.hits >= 4, `Танец лепестков: ${r.names.join(" → ")}, попаданий ${r.hits}`);
  console.log(`     урон ${Math.round(r.dmg)}`);

  // «и» после удара в долю: два разреза в одну точку (сверху вниз и обратно)
  await page.evaluate(() => { window.__setup(28); window.__beat(false); const g = window.__game; window.__plan.push(window.__plan[0] + g.clock.period / 2 + 0.005); });
  await done(); r = await res();
  check(r.names[1] === "katanaSwallow" && r.hits >= 2, `Ласточка: ${r.names.join(" → ")}, попаданий ${r.hits}`);
  console.log(`     урон ${Math.round(r.dmg)}`);

  console.log("— Теневой кинжал —");
  await use("dagger");
  await page.evaluate(() => { window.__setup(80, { free: true }); window.__beat(false); });
  await done(); r = await res();
  check(r.names[0] === "daggerStep" && r.hits >= 1 && r.px > r.ex, `Теневой шаг: ${r.names.join(" → ")}, герой за спиной (${Math.round(r.px)} > ${Math.round(r.ex)})`);
  console.log(`     урон ${Math.round(r.dmg)}`);
  await page.evaluate(() => { window.__setup(180); window.__beat(false); });
  await done(); r = await res();
  check(r.names[0] === "daggerKnives" && r.hits >= 2, `Веер ножей: ${r.names.join(" → ")}, попаданий ${r.hits}`);
  console.log(`     урон ${Math.round(r.dmg)}`);

  await page.evaluate(() => { window.__setup(28, { chain: 3 }); window.__beat(true); });
  await done(); r = await res();
  check(r.names[0] === "daggerWhirl" && r.hits >= 2, `Вихрь теней: ${r.names.join(" → ")}, попаданий ${r.hits}`);
  console.log(`     урон ${Math.round(r.dmg)}`);

  console.log("— добивания —");
  for (const [w, id] of [["kusari", "kusariCoil"], ["katana", "katanaIai"], ["dagger", "daggerFlurry"]]) {
    await use(w);
    const r2 = await page.evaluate(async () => {
      const g = window.__game; window.__pin = false; g.waves.queue = []; g.waves.between = 999; g.enemies = []; g.combat.lastTdT = -9; g.player.reset(600); g.player.hp = 100;
      const e = g.waves.spawn("blade"); e.x = 630; e.state = "think"; e.hp = 1; window.__te = e;
      const act = { def: window.weaponDefRef("slash1", g.settings.v), name: "slash1", judge: { rating: "perfect", strong: true }, power: 1, hit: new Set() };
      g.combat._applyHit(e, act, 1, e.x, e.centerY);
      return g.combat.td && g.combat.td.kind;
    });
    await wait(520);
    await page.screenshot({ path: path.join(shots, `kit-td-${id}.png`) });
    await wait(2300);
    const after = await page.evaluate(() => { const g = window.__game; return { td: !!g.combat.td, st: g.player.state, dead: !window.__te.alive, scripted: g.player.scripted }; });
    r = null;
    check(r2 === id, `добивание ${w}: выбрано ${r2}`);
    check(!after.td && after.dead && !after.scripted && after.st !== "takedown", `добивание ${id}: завершилось, враг мёртв (${after.dead}), герой ${after.st}`);
  }
  // в воздухе и громила — встроенные добивания
  await use("katana");
  const bt = await page.evaluate(async () => {
    const g = window.__game; g.enemies = []; g.combat.lastTdT = -9; g.player.reset(600);
    const e = g.waves.spawn("brute"); e.x = 630; e.state = "think"; e.hp = 1;
    g.combat._applyHit(e, { def: window.weaponDefRef("slash1", g.settings.v), name: "slash1", judge: { rating: "perfect", strong: true }, power: 1, hit: new Set() }, 1, e.x, e.centerY);
    const k = g.combat.td && g.combat.td.kind; await new Promise(r => setTimeout(r, 2800)); return [k, !!g.combat.td];
  });
  r = null; check(bt[0] === "colossus" && !bt[1], `громила: встроенный ${bt[0]}, завершилось`);

  await browser.close();
  if (errors.length) { console.log("ОШИБКИ:\n" + errors.join("\n")); bad++; }
  console.log(bad ? `ПРОБЛЕМ: ${bad}` : "всё в норме");
  process.exit(bad ? 1 : 0);
})();
