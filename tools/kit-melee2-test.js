// Оружие ближнего боя, часть 2 (12k_e_melee2): node tools/kit-melee2-test.js
// Для nunchaku/claws/twinsteel/tessen: каждая своя комбинация вызывается точными нажатиями против неподвижного врага с большим HP
// (выбран нужный приём, попадания есть, эффекты приёма сработали), своё добивание срабатывает, завершается, управление
// возвращается, враг умирает. Скриншоты середины добиваний — .shots/kit-m2-td-*.png. Ошибки страницы — провал.
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
      if (window.__pin) for (const e of g.enemies) { if (!window.__free) e.x = e.__px != null ? e.__px : window.__pin.x; e.vx = 0; e.attackCD = 9; if (e.alive && e.y < 0 && e.state !== "hurt") { e.y = 0; e.vy = 0; e.onGround = true; } }
      while (window.__plan.length && t >= window.__plan[0]) { const at = window.__plan.shift(); if (t - at < 0.03) c.onAttackPress(at); }
    };
    window.__setup = (dist, opts = {}) => {
      g.waves.queue = []; g.waves.pending = []; g.waves.between = 999;
      for (const e of g.enemies) e.dead = true; g.enemies = [];
      const p = g.player; p.x = 600; p.y = 0; p.vx = 0; p.vy = 0; p.onGround = true; p.action = null; p.setState("idle"); p.facing = 1; p.counterT = 0;
      Object.assign(c, { comboStep: 0, lastMeleeT: -9, lastRiseT: -9, shotChain: 0, lastAction: null, lastActionT: -9, chain: opts.chain || 0, airChain: 0, lastPress: null, lastTdT: 99, kbGrabT: -9, kbDagT: -9, kuWrapT: -9, kuPendT: -9, _kitT: {} });
      const e = g.waves.spawn(opts.kind || "blade", true);
      e.x = p.x + dist; e.__px = e.x; e.y = 0; e.maxHp = e.hp = 1e5; e.attackCD = 99;
      window.__pin = { x: e.x }; window.__free = !!opts.free; window.__recent = !!opts.recent;
      window.__names.length = 0; window.__hits = 0; window.__hitLog = []; window.__plan.length = 0;
      return e;
    };
    window.__second = dx => { const p = g.player, e = g.waves.spawn("blade", true); e.x = p.x + dx; e.__px = e.x; e.y = 0; e.maxHp = e.hp = 1e5; e.attackCD = 99; return e; };
    // нажатие на ближайшей доле (strong: true — на сильной, false — на не сильной), со сдвигом off
    window.__beat = (strong, off = -0.02) => {
      const cl = g.clock, m = cl.map; let t = cl.nextBeatAfter(g.songNow, 0.9), i = 0;
      while (i++ < 20) { const k = m.beats.findIndex(b => Math.abs(b + cl.correction - t) < 1e-3); if (k >= 0 && !!m.strong[k] === strong) break; t = cl.nextBeatAfter(t, 0.05); }
      window.__plan.push(t + off); return t;
    };
  });
  const wait = ms => page.waitForTimeout(ms);
  const done = async () => { await page.waitForFunction(() => !window.__plan.length && !window.__game.player.action && window.__game.player.onGround, null, { timeout: 9000 }).catch(() => {}); await wait(350); };
  const res = () => page.evaluate(() => ({ dmgs: window.__game.enemies.map(e => Math.round(1e5 - e.hp)), names: window.__names.slice(), hits: window.__hits, log: window.__hitLog.join(" "), px: window.__game.player.x, ex: window.__game.enemies[0] && window.__game.enemies[0].x, dmg: window.__game.enemies[0] ? 1e5 - window.__game.enemies[0].hp : 0, combos: Object.assign({}, window.__game.combat.combos) }));
  const use = w => page.evaluate(w => { window.__game.settings.v.meleeWeapon = w; }, w);
  let bad = 0, r = null;
  const check = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg + (ok || !r ? "" : "   [попадания: " + r.log + "]")); if (!ok) bad++; };

  const fire = async (setup, strong) => { await page.evaluate(([setup, strong]) => { eval(setup); window.__beat(strong); }, [setup, strong]); await done(); return res(); };

  console.log("— Громовые нунчаки —");
  await use("nunchaku");
  r = await fire("window.__setup(28)", true);
  check(r.names[0] === "nuEight" && r.hits >= 3, `Восьмёрка: ${r.names.join(" → ")}, попаданий ${r.hits}`); console.log(`     урон ${Math.round(r.dmg)}`);
  r = await fire("window.__setup(130, { free: true })", false);
  check(r.names[0] === "nuLash" && r.hits >= 1, `Хлёст: ${r.names.join(" → ")}, попаданий ${r.hits}`); console.log(`     урон ${Math.round(r.dmg)}`);
  r = await fire("window.__setup(28); window.__second(-28)", false);
  check(r.names[0] === "nuCatch" && r.hits >= 2 && r.dmgs.every(d => d > 0), `Перехват: ${r.names.join(" → ")}, попаданий ${r.hits}, урон врагам ${r.dmgs.join(" и ")}`);

  console.log("— Волчьи когти —");
  await use("claws");
  r = await fire("window.__setup(28)", true);
  check(r.names[0] === "clRend" && r.hits >= 2, `Разрыв: ${r.names.join(" → ")}, попаданий ${r.hits}`); console.log(`     урон ${Math.round(r.dmg)}`);
  r = await fire("window.__setup(28, { chain: 9 })", true);
  check(r.names[0] === "clFrenzy" && r.hits >= 5, `Бешенство: ${r.names.join(" → ")}, попаданий ${r.hits}`); console.log(`     урон ${Math.round(r.dmg)}`);
  r = await fire("window.__setup(130, { free: true })", false);
  check(r.names[0] === "clPounce" && r.hits >= 1, `Прыжок волка: ${r.names.join(" → ")}, попаданий ${r.hits}`); console.log(`     урон ${Math.round(r.dmg)}`);

  console.log("— Двойная сталь —");
  await use("twinsteel");
  r = await fire("window.__setup(28)", true);
  check(r.names[0] === "tsScissors" && r.hits >= 2, `Ножницы: ${r.names.join(" → ")}, попаданий ${r.hits}`); console.log(`     урон ${Math.round(r.dmg)}`);
  r = await fire("window.__setup(130, { free: true })", false);
  check(r.names[0] === "tsLunge" && r.hits >= 1 && r.px > r.ex, `Выпад с перехватом: ${r.names.join(" → ")}, попаданий ${r.hits}, герой за врагом (${Math.round(r.px)} > ${Math.round(r.ex)})`); console.log(`     урон ${Math.round(r.dmg)}`);

  console.log("— Стальной веер —");
  await use("tessen");
  r = await fire("window.__setup(28)", true);
  check(r.names[0] === "teGust" && r.hits >= 2, `Порыв: ${r.names.join(" → ")}, попаданий ${r.hits}`); console.log(`     урон ${Math.round(r.dmg)}`);
  r = await fire("window.__setup(130, { free: true })", false);
  check(r.names[0] === "teThrow" && r.hits >= 2, `Бросок веера: ${r.names.join(" → ")}, попаданий ${r.hits} (вылет и возврат)`); console.log(`     урон ${Math.round(r.dmg)}`);

  console.log("— добивания —");
  for (const [w, id] of [["nunchaku", "nuThunder"], ["claws", "clMaul"], ["twinsteel", "tsCross"], ["tessen", "teDance"]]) {
    await use(w);
    const r2 = await page.evaluate(async () => {
      const g = window.__game; window.__pin = false; g.waves.queue = []; g.waves.between = 999; g.enemies = []; g.combat.lastTdT = -9; g.player.reset(600); g.player.hp = 100;
      const e = g.waves.spawn("blade"); e.x = 630; e.state = "think"; e.hp = 1; window.__te = e;
      const act = { def: window.weaponDefRef("slash1", g.settings.v), name: "slash1", judge: { rating: "perfect", strong: true }, power: 1, hit: new Set() };
      g.combat._applyHit(e, act, 1, e.x, e.centerY);
      return g.combat.td && g.combat.td.kind;
    });
    await wait(520);
    await page.screenshot({ path: path.join(shots, `kit-m2-td-${id}.png`) });
    await wait(2300);
    const after = await page.evaluate(() => { const g = window.__game; return { td: !!g.combat.td, st: g.player.state, dead: !window.__te.alive, scripted: g.player.scripted }; });
    r = null;
    check(r2 === id, `добивание ${w}: выбрано ${r2}`);
    check(!after.td && after.dead && !after.scripted && after.st !== "takedown", `добивание ${id}: завершилось, враг мёртв (${after.dead}), герой ${after.st}`);
  }
  // в воздухе и громила — встроенные добивания
  for (const w of ["nunchaku", "claws", "twinsteel", "tessen"]) {
    await use(w);
    const bt = await page.evaluate(async () => {
      const g = window.__game; g.enemies = []; g.combat.lastTdT = -9; g.player.reset(600);
      const e = g.waves.spawn("brute"); e.x = 630; e.state = "think"; e.hp = 1;
      g.combat._applyHit(e, { def: window.weaponDefRef("slash1", g.settings.v), name: "slash1", judge: { rating: "perfect", strong: true }, power: 1, hit: new Set() }, 1, e.x, e.centerY);
      const k = g.combat.td && g.combat.td.kind; await new Promise(r => setTimeout(r, 2800)); return [k, !!g.combat.td];
    });
    r = null; check(bt[0] === "colossus" && !bt[1], `громила (${w}): встроенный ${bt[0]}, завершилось`);
  }

  await browser.close();
  if (errors.length) { console.log("ОШИБКИ:\n" + errors.join("\n")); bad++; }
  console.log(bad ? `ПРОБЛЕМ: ${bad}` : "всё в норме");
  process.exit(bad ? 1 : 0);
})();
