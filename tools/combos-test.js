// Комбинации атак: node tools/combos-test.js
// Каждая комбинация вызывается точными нажатиями (в долю / на полдоли) против неподвижного врага с большим HP:
// Крест (4-й удар серии), Шквал (полдоли после удара), Сквозной рывок (сильная доля, грув ≥ 2),
// Ответ (окно контрудара), Метеор (в воздухе после двух ударов), Веер (3-й выстрел подряд).
// Проверка: выбран нужный приём, враг получил ожидаемое число попаданий, нет ошибок страницы. Скриншоты .shots/combo-*.png.
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
  await page.evaluate(() => { const g = window.__game; g.settings.v.poseMode = "off"; g.settings.v.slowmoMode = "off"; g.startBattle("waves"); });
  await page.waitForFunction(() => window.__game.state === "battle", null, { timeout: 60000 });
  await page.evaluate(() => {
    const g = window.__game, c = g.combat;
    window.__names = [];
    const ex = c.execute.bind(c);
    c.execute = s => { const r = ex(s); if (g.player.action) window.__names.push(g.player.action.name); return r; };
    const ah = c._applyHit.bind(c);
    window.__hits = 0;
    c._applyHit = (e, act, ...a) => { window.__hits++; window.__hitLog.push(act.name + ":" + (act.sub || 0)); return ah(e, act, ...a); };
    // нажатия в заданное музыкальное время (как событие ввода с отметкой времени), в начале кадра
    window.__plan = [];
    const cu = g.clock.update.bind(g.clock);
    g.clock.update = (t, dt, l, pl) => {
      cu(t, dt, l, pl);
      const p = g.player;
      p.hp = p.maxHp; p.iframes = Math.max(p.iframes, 0.2);
      if (window.__pin) for (const e of g.enemies) { e.x = window.__pin.x; e.vx = 0; e.attackCD = 9; }
      while (window.__plan.length && t >= window.__plan[0]) { const at = window.__plan.shift(); if (t - at < 0.03) c.onAttackPress(at); }
    };
    window.__setup = (dist, opts = {}) => {
      g.waves.queue = []; g.waves.pending = []; g.waves.between = 999;
      for (const e of g.enemies) e.dead = true; g.enemies = [];
      const p = g.player; p.x = 600; p.y = 0; p.vx = 0; p.vy = 0; p.onGround = true; p.action = null; p.setState("idle"); p.facing = 1; p.counterT = 0;
      Object.assign(c, { comboStep: 0, lastMeleeT: -9, shotChain: 0, lastAction: null, lastActionT: -9, chain: opts.chain || 0, airChain: 0, lastPress: null, lastTdT: 99 });
      const e = g.waves.spawn(opts.kind || "blade", true);
      e.x = p.x + dist; e.y = 0; e.maxHp = e.hp = 1e5; e.attackCD = 99;
      window.__pin = { x: e.x };
      window.__names.length = 0; window.__hits = 0; window.__hitLog = []; window.__plan.length = 0;
      return e;
    };
    // n нажатий: от ближайшей доли через ≥ 0.4 с, со сдвигом off (в долях), шаг step долей
    window.__beats = (n, off = -0.02, step = 1, half = []) => {
      const cl = g.clock, P = cl.period;
      let b = cl.nextBeatAfter(g.songNow, 0.9);   // враг успевает выйти из портала
      const out = [];
      for (let i = 0; i < n; i++) { out.push(b + off); if (half.includes(i)) out.push(b + P / 2 + off); b = cl.nextBeatAfter(b, P * (step - 0.5)); }
      window.__plan.push(...out);
      return out;
    };
  });
  const wait = ms => page.waitForTimeout(ms);
  // сценарий закончен: все нажатия исполнены, герой свободен, ещё 0.3 с на попадания
  const done = async () => { await page.waitForFunction(() => !window.__plan.length && !window.__game.player.action && window.__game.player.onGround, null, { timeout: 8000 }).catch(() => {}); await wait(300); };
  const res = () => page.evaluate(() => ({ names: window.__names.slice(), hits: window.__hits, log: window.__hitLog.join(" "), combos: Object.assign({}, window.__game.combat.combos) }));
  let bad = 0;
  const check = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg + (ok || !r ? "" : "   [попадания: " + r.log + "]")); if (!ok) bad++; };
  let r = null;

  // 1) Крест: 4 удара в такт вплотную
  await page.evaluate(() => { window.__setup(28); window.__beats(4); });
  await done();
  r = await res();
  check(r.names.join(",") === "slash1,slash2,slash3,cross", `Крест: ${r.names.join(" → ")}`);
  check(r.hits >= 5, `Крест: попаданий ${r.hits} (≥ 5: 3 + два удара креста)`);
  await page.screenshot({ path: path.join(shots, "combo-cross.png") });

  // 2) Шквал: удар в долю, затем на полдоли
  await page.evaluate(() => {
    const g = window.__game; window.__setup(28);
    // не на сильной доле (там вместо удара — подброс)
    const cl = g.clock, m = cl.map; let t = cl.nextBeatAfter(g.songNow, 0.9), i = 0;
    while (i++ < 8) { const k = m.beats.findIndex(b => Math.abs(b + cl.correction - t) < 1e-3); if (k >= 0 && !m.strong[k]) break; t = cl.nextBeatAfter(t, 0.05); }
    window.__plan.push(t - 0.02, t + cl.period / 2 - 0.02);
  });
  await done();
  r = await res();
  check(r.names[1] === "flurry", `Шквал: ${r.names.join(" → ")}`);
  check(r.hits >= 4, `Шквал: попаданий ${r.hits} (≥ 4: удар + три укола)`);

  // 3) Сквозной рывок: грув ≥ 2, сильная доля, враг на средней дистанции
  await page.evaluate(() => {
    const g = window.__game; window.__setup(140, { chain: 9 });
    const cl = g.clock, m = cl.map; let t = cl.nextBeatAfter(g.songNow, 0.9), i = 0;
    while (i++ < 16) { const k = m.beats.findIndex(b => Math.abs(b + cl.correction - t) < 1e-3); if (k >= 0 && m.strong[k]) break; t = cl.nextBeatAfter(t, 0.05); }
    window.__plan.push(t - 0.02); window.__ex0 = g.enemies[0].x;
  });
  await done();
  r = await res();
  const behind = await page.evaluate(() => window.__game.player.x > window.__ex0);
  check(r.names[0] === "pierce", `Сквозной рывок: ${r.names.join(" → ")}`);
  check(behind && r.hits >= 2, `Сквозной рывок: герой за спиной врага (${behind}), попаданий ${r.hits} (≥ 2: на пути + разворот)`);

  // 4) Ответ: окно контрудара
  await page.evaluate(() => { window.__setup(30); window.__beats(1); setTimeout(() => { window.__game.player.counterT = 1; }, 700); });
  await done();
  r = await res();
  check(r.names[0] === "riposte", `Ответ: ${r.names.join(" → ")}`);
  check(r.hits >= 2, `Ответ: попаданий ${r.hits} (≥ 2)`);

  // 5) Метеор: в воздухе после двух воздушных ударов
  await page.evaluate(() => {
    const g = window.__game, p = g.player; window.__setup(40);
    const at = window.__beats(1)[0];
    // в воздух за ~0.2 с до нажатия (раньше — герой успеет приземлиться)
    setTimeout(() => { p.y = -170; p.vy = -60; p.onGround = false; p.setState("jump"); g.combat.airChain = 2; }, Math.max(0, (at - g.songNow - 0.2) * 1000));
  });
  await done();
  r = await res();
  check(r.names[0] === "meteor", `Метеор: ${r.names.join(" → ")}`);
  check(r.hits >= 1 && await page.evaluate(() => window.__game.player.onGround), `Метеор: приземлился, попаданий ${r.hits}`);
  await page.screenshot({ path: path.join(shots, "combo-meteor.png") });

  // 6) Веер: выстрелы издалека в такт (good, не perfect: +60 мс)
  await page.evaluate(() => { window.__setup(380); window.__beats(5, 0.06); });
  await done();
  r = await res();
  check(r.names.includes("fan"), `Веер: ${r.names.join(" → ")}`);
  await page.screenshot({ path: path.join(shots, "combo-fan.png") });

  // без новых комбинаций: обычные удары не изменились (нажатия вразнобой → укол)
  await page.evaluate(() => { window.__setup(28); window.__beats(2, 0.2, 3); });
  await done();
  r = await res();
  check(!r.names.some(n => ["cross", "flurry", "riposte"].includes(n)), `неточные нажатия без комбинаций: ${r.names.join(" → ")}`);

  const total = await page.evaluate(() => window.__game.combat.combos);
  console.log("комбинации за прогон:", JSON.stringify(total));
  await browser.close();
  if (errors.length) { console.log("ОШИБКИ:\n" + errors.join("\n")); bad++; }
  console.log(bad ? `ПРОБЛЕМ: ${bad}` : "всё в норме");
  process.exit(bad ? 1 : 0);
})();
