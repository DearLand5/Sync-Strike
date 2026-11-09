// Наборы огнестрела, часть 3 (12k_f_guns3): node tools/kit-guns3-test.js
// Дальнобойная винтовка: «В голову», «Затвор»; Тихий арбалет: «Пригвождение», «Град болтов»; Ручной гранатомёт: «Каскад», «Взрыв под ногами».
// Каждая комбинация вызывается точными нажатиями против неподвижных врагов с большим HP; проверяются выбранный приём и попадания.
// Затем добивание каждого оружия (форсируется смертельным ударом): срабатывает, завершается, управление вернулось, враг мёртв.
// Урон за нажатие сравнивается с веером/заряженным/двойным того же оружия (по формулам defs). Скриншоты .shots/kg3-*.png.
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
    c._applyHit = (e, act, ...a) => { window.__hits++; window.__hitLog.push(act.name); window.__hitT.push(g.songNow); return ah(e, act, ...a); };
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
    window.__pinMax = 0; window.__minY = 0; window.__hitT = [];
    const cu2 = g.clock.update;
    g.clock.update = (t, dt, l, pl) => {
      cu2(t, dt, l, pl);
      for (const e of g.enemies) { if (e.kfPin > window.__pinMax) window.__pinMax = e.kfPin; if (e.y < window.__minY) window.__minY = e.y; }
    };
    window.__setup = (dists, opts = {}) => {
      window.__pinMax = 0; window.__minY = 0; window.__hitT = [];
      g.waves.queue = []; g.waves.pending = []; g.waves.between = 999;
      for (const e of g.enemies) e.dead = true; g.enemies = [];
      const p = g.player; p.x = 600; p.y = 0; p.vx = 0; p.vy = 0; p.onGround = true; p.action = null; p.setState("idle"); p.facing = opts.facing || 1; p.counterT = 0;
      Object.assign(c, { comboStep: 0, lastMeleeT: -9, shotChain: 0, lastAction: null, lastActionT: -9, chain: opts.chain || 0, airChain: 0, lastPress: null, lastTdT: 99, combo: 0, kfHeadT: -9, kfBoltT: -9, kfNailT: -9, kfHailT: -9, kfCascT: -9, kfBlastT: -9, kfGren: [] });
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
    const mineOf = { sniper: ["sniperHead", "sniperBolt"], crossbow: ["xbowNail", "xbowHail"], launcher: ["launchCascade", "launchBlast"] };
    for (const id in mineOf) {
      const s = { gunWeapon: id, meleeWeapon: "dagger" }, v = n => { const d = window.weaponDefRef(n, s); return d.dmg * (d.shots || 1); };
      const refs = ["twin", "fan", "charged"].map(v);
      // «Град болтов»: 5 болтов на одну цель; «Каскад»: враг в радиусе ~2 из 3 взрывов; остальное — одна цель
      const mult = { xbowHail: 5, launchCascade: 2 };
      out[id] = { ref: refs.reduce((a, b) => a + b, 0) / 3, mine: mineOf[id].map(n => { const d = window.ATTACKS_REF[n]; return [n, d.dmg * (mult[n] || d.shots || 1)]; }), shot: v("shot") };
    }
    return out;
  });
  for (const id in dmgs) for (const [n, d] of dmgs[id].mine) {
    const ref = dmgs[id].ref, ratio = d / ref;
    r = null; check(ratio > 0.7 && ratio < 1.3 || (n === "sniperBolt" && ratio > 0.5 /* быстрый добавочный выстрел: короткий цикл */), `${n}: урон за нажатие по одной цели ${d.toFixed(1)} против ${ref.toFixed(1)} (${(ratio * 100).toFixed(0)}%)`);
  }

  // ---------- винтовка ----------
  console.log("— Дальнобойная винтовка —");
  await use("sniper");
  await page.evaluate(() => { window.__setup([380, 470]); window.__plan.push(window.__beatKind(true) - 0.02); });
  await wait(1100);
  await page.screenshot({ path: path.join(shots, "kg3-sniper-head.png") });
  await done(); r = await res();
  check(r.names[0] === "sniperHead", `В голову выбран: ${r.names.join(" → ")}`);
  check(r.hits >= 2 && r.hp.every(d => d > 0) && r.hp[0] > r.hp[1], `В голову: луч пробил обоих (урон ${r.hp.join(" и ")}), прицельный получил больше`);
  // «Затвор»: выстрел на неслабую долю, затем «и»
  await page.evaluate(() => { window.__setup(380); const cl = window.__game.clock, t = window.__beatKind(false); window.__plan.push(t - 0.02, t + cl.period / 2 - 0.02); });
  await done(); r = await res();
  check(r.names[1] === "sniperBolt", `Затвор: ${r.names.join(" → ")}`);
  check(r.hits >= 2, `Затвор: попаданий ${r.hits}`);
  await page.screenshot({ path: path.join(shots, "kg3-sniper-bolt.png") });
  // без условий — обычный выстрел
  await page.evaluate(() => { window.__setup(380); window.__beats(1, 0.2); });
  await done(); r = await res();
  check(!["sniperHead", "sniperBolt"].includes(r.names[0]), `неточное нажатие без комбинаций: ${r.names.join(" → ")}`);

  // ---------- арбалет ----------
  console.log("— Тихий арбалет —");
  await use("crossbow");
  await page.evaluate(() => { window.__setup([380, 470]); window.__plan.push(window.__beatKind(true) - 0.02); });
  await wait(700);
  await page.screenshot({ path: path.join(shots, "kg3-xbow-nail.png") });
  await done(); r = await res();
  const pin = await page.evaluate(() => window.__pinMax);
  check(r.names[0] === "xbowNail", `Пригвождение выбрано: ${r.names.join(" → ")}`);
  check(r.hits >= 2 && r.hp.every(d => d > 0), `Пригвождение: болт навылет задел обоих (урон ${r.hp.join(" и ")})`);
  check(pin > 0.2 && pin < 1.6, `Пригвождение: враг удержан до доли (kfPin макс ${pin.toFixed(2)} с)`);
  await wait(900);
  const left = await page.evaluate(() => window.__game.enemies.filter(e => e.kfPin > 0).length);
  check(left === 0, `Пригвождение: после доли врага отпустило (осталось ${left})`);
  // обычный болт тоже пригвождает
  await page.evaluate(() => { window.__setup(380); window.__beats(1, 0.2); });
  await done(); r = await res();
  const pin2 = await page.evaluate(() => window.__pinMax);
  check(r.hits >= 1 && pin2 > 0.1, `обычный болт: попадание ${r.hits}, пригвождение ${pin2.toFixed(2)} с`);
  // Град болтов: двое врагов, грув 2
  await page.evaluate(() => { window.__setup([300, 400], { chain: 9 }); window.__plan.push(window.__beatKind(true) - 0.02); });
  await wait(700);
  await page.screenshot({ path: path.join(shots, "kg3-xbow-hail.png") });
  await done(); r = await res();
  check(r.names[0] === "xbowHail", `Град болтов выбран: ${r.names.join(" → ")}`);
  check(r.hits >= 5 && r.hp.every(d => d > 0), `Град болтов: попаданий ${r.hits}, урон по врагам ${r.hp.join(" и ")}`);

  // ---------- гранатомёт ----------
  console.log("— Ручной гранатомёт —");
  await use("launcher");
  // обычный выстрел: взрыв на доле
  await page.evaluate(() => { window.__setup(330); window.__beats(1, -0.02); });
  await wait(300);
  await page.screenshot({ path: path.join(shots, "kg3-launcher-fuse.png") });
  await done(); await wait(900); r = await res();
  const ht = await page.evaluate(() => { const g = window.__game, cl = g.clock, m = cl.map; return window.__hitT.map(t => Math.min(...m.beats.map(b => Math.abs(b + cl.correction - t))) * 1000); });
  check(r.hits >= 1 && ht.length && ht[0] < 40, `обычный выстрел: взрыв на доле (отклонение ${ht.map(x => x.toFixed(0)).join(", ")} мс), попаданий ${r.hits}`);
  // два врага рядом: площадь
  await page.evaluate(() => { window.__setup([330, 370]); window.__beats(1, -0.02); });
  await done(); await wait(900); r = await res();
  check(r.hp.length === 2 && r.hp.every(d => d > 0), `взрыв по площади: урон ${r.hp.join(" и ")}`);
  await page.evaluate(() => { window.__setup([330, 370]); window.__beats(1, -0.02); });
  await wait(450);
  await page.screenshot({ path: path.join(shots, "kg3-launcher-boom.png") });
  await done();
  // Каскад: сильная доля, грув 1
  await page.evaluate(() => { window.__setup(330, { chain: 4 }); window.__plan.push(window.__beatKind(true) - 0.02); });
  await wait(250);
  await page.screenshot({ path: path.join(shots, "kg3-launcher-cascade.png") });
  await done(); await wait(900); r = await res();
  check(r.names[0] === "launchCascade", `Каскад выбран: ${r.names.join(" → ")}`);
  check(r.hits >= 2, `Каскад: попаданий ${r.hits} (цепочка взрывов), урон ${r.hp.join(" и ")}`);
  // Взрыв под ногами: враг вплотную, герой отходит
  await page.evaluate(() => { window.__setup(28, { mx: -1 }); window.__beats(1, -0.02); });
  await wait(1300);
  await done(); await wait(600); r = await res();
  const up = await page.evaluate(() => window.__minY);
  check(r.names[0] === "launchBlast", `Взрыв под ногами выбран: ${r.names.join(" → ")}`);
  check(r.hits >= 1 && up < -25, `Взрыв под ногами: попаданий ${r.hits}, враг подброшен на ${(-up).toFixed(0)} ед.`);
  await page.evaluate(() => { window.__setup(28, { mx: -1 }); window.__beats(1, -0.02); });
  await wait(430);
  await page.screenshot({ path: path.join(shots, "kg3-launcher-blast.png") });
  await done();

  // ---------- добивания ----------
  console.log("— добивания —");
  const tdKinds = { sniper: "sniperShot", crossbow: "xbowImpale", launcher: "launcherAirburst" };
  for (const gn of ["sniper", "crossbow", "launcher"]) {
    await use(gn);
    for (const kind of ["blade", "gunner", "swift", "brute"]) {
      const shotsAt = kind === "blade" ? [0.3, 0.6, 0.95] : [];
      await page.evaluate(([kind]) => {
        const g = window.__game; window.__pin = false; window.__free = false;
        g.waves.queue = []; g.waves.pending = []; g.waves.between = 999; g.enemies = []; g.combat.lastTdT = -9; g.combat.td = null; g.combat.kfGren = [];
        g.player.reset(600); g.player.hp = 100;
        const e = g.waves.spawn(kind); e.x = 900; e.y = 0; e.state = "think"; e.hp = 1; e.attackCD = 99; window.__tdE = e;
        const act = { def: window.weaponDefRef("shot", g.settings.v), name: "shot", judge: { rating: "perfect", strong: true }, power: 1, hit: new Set() };
        g.combat._applyHit(e, act, 1, e.x, e.centerY);
      }, [kind]);
      const k0 = await page.evaluate(() => window.__game.combat.td && window.__game.combat.td.kind);
      let prev = 0;
      for (const ms of shotsAt) { await wait(ms * 1000 - prev); prev = ms * 1000; await page.screenshot({ path: path.join(shots, `kg3-td-${gn}-${Math.round(ms * 100)}.png`) }); }
      await wait(2500);
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
