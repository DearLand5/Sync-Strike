// «Удар в бит» и группы врагов: node tools/beat-feel-test.js [сек на режим]
// 1) Нажатия атаки со сдвигом −120…+100 мс от доли: момент удара (конец подготовки) против доли — с подгонкой и без.
// 2) Звук взмаха/выстрела ставится на долю (Game.sfxAt): доля звуков, поставленных заранее.
// 3) Шаги бега на долях: ошибка фазы шага (мс).
// 4) Спавн группами («Волны» и «До конца трека»): группа появляется целиком, следующая — только когда выбита
//    предыдущая; задержка от «поле пустое» до первого врага группы; размеры групп при Меньше/Норма/Больше.
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
const secs = +(process.argv[2] || 40);
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const p90 = a => { const s = a.map(Math.abs).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length * 0.9)] : NaN; };

async function run(browser, mode, opts) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 560 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("file://" + path.join(__dirname, "../index.html"));
  await page.waitForTimeout(300);
  await page.evaluate(o => { const S = window.__game.settings; S.v.assist = o.assist; S.v.spawnAmount = o.spawn; S.v.slowmoMode = "off"; }, opts);
  await page.evaluate(m => window.__game.startBattle(m), mode);
  await page.waitForFunction(() => window.__game.state === "battle", null, { timeout: 60000 });
  await page.evaluate(() => {
    const g = window.__game, inp = g.input, W = g.waves;
    const L = g.__log = { imp: [], sched: 0, now: 0, steps: [], spawns: [], groups: [] };
    // спавн: время, сколько живых было перед ним
    const sp = W.spawn.bind(W);
    W.spawn = (k, pa, el) => { L.spawns.push({ t: g.songNow, alive: W.aliveCount(), clearT: W.__clear }); return sp(k, pa, el); };
    // сколько поле было пустым к моменту, когда решено выпустить группу (+ разнос порталов/таймер до первого)
    for (const fn of ["_takeGroup", "_trackGroup"]) { const f = W[fn].bind(W); W[fn] = (...a) => { W.__clear = W.clearT; return f(...a); }; }
    // звуки «в долю»
    const sa = g.sfxAt.bind(g);
    g.sfxAt = (t, n, a, b) => { if (g.audio.ctxTimeAt(t) != null && g.timeScale > 0.97) L.sched++; else L.now++; return sa(t, n, a, b); };
    // шаги
    const sfx = g.sfx.bind(g);
    g.sfx = (n, a, b) => {
      if (n === "step") {
        const c = g.clock, p = g.player, rate = Math.abs(p.vx) * 0.075, spb = rate / Math.PI * c.period;
        if (Math.abs(p.vx) > 170) {   // только ровный бег (разгон/торможение — фаза подтягивается)
          const m = spb < 0.7 ? 0.5 : Math.min(4, Math.max(1, Math.round(spb)));
          const x = (Math.max(0, c.idx) + c.phase) * m, f = x - Math.floor(x);
          L.steps.push(Math.min(f, 1 - f) * c.period / m * 1000);
        }
      }
      return sfx(n, a, b);
    };
    // удар: момент перехода из подготовки
    let prevAct = null, wasStartup = false;
    const watch = () => {
      const a = g.player.action;
      if (a && a.judge && a.judge.index >= 0) {
        if (a !== prevAct) { prevAct = a; wasStartup = true; }
        const t0 = a.startup + (a.travel || 0) + (a.def.fireAt || 0);
        if (wasStartup && a.t >= t0) { wasStartup = false; L.imp.push({ d: (g.songNow - a.judge.beatTime) * 1000, plan: (a.impactSong - a.judge.beatTime) * 1000, press: a.__press, exec: a.__exec, name: a.name, onBeat: a.onBeat, kind: a.def.kind, ts: g.timeScale }); }
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
    const ex = g.combat.execute.bind(g.combat);
    g.combat.execute = s => { const r = ex(s); const a = g.player.action; if (a) { a.__press = Math.round((s - a.judge.beatTime) * 1000); a.__exec = (g.songNow - a.judge.beatTime) * 1000; } return r; };
    // бот: подходит к ближайшему, уклоняется; атака со сдвигом от доли по кругу
    const offs = [-0.12, -0.08, -0.05, -0.03, -0.01, 0, 0.01, 0.03, 0.05, 0.08, 0.1];
    let k = 0, planned = null;
    g.__bot = setInterval(() => {
      if (g.state !== "battle") return;
      const p = g.player;
      let tgt = null, bd = 1e9;
      for (const e of g.enemies) if (e.targetable) { const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y) * 0.5; if (d < bd) { bd = d; tgt = e; } }
      inp.keys.delete("KeyA"); inp.keys.delete("KeyD");
      if (tgt) {
        const dx = tgt.x - p.x;
        if (Math.abs(dx) > 60) inp.keys.add(dx > 0 ? "KeyD" : "KeyA");
        for (const e of g.enemies) if (e.state === "windup" && e.windDur - e.windT < 0.12 && Math.abs(e.x - p.x) < 150) { inp.push("dodge"); break; }
      }
    }, 5);
    // нажатие ровно в запланированное музыкальное время (в начале кадра, как событие ввода с отметкой времени)
    const cu = g.clock.update.bind(g.clock);
    g.clock.update = (t, dt, live, playing) => {
      cu(t, dt, live, playing);
      if (g.state !== "battle") return;
      if (!planned) { const b = g.clock.nextBeatAfter(t, 0.3); planned = b + offs[k++ % offs.length]; }
      if (t >= planned) { const at = planned; planned = null; if (g.enemies.some(e => e.targetable) && t - at < 0.02) g.combat.onAttackPress(at); }
    };
  });
  await page.waitForTimeout(secs * 1000);
  const L = await page.evaluate(() => { clearInterval(window.__game.__bot); return window.__game.__log; });
  await page.close();
  return { L, errors };
}

function spawnStats(L) {
  // группы: подряд идущие появления с промежутком < 0.6 с
  const gr = [];
  for (const s of L.spawns) {
    const last = gr[gr.length - 1];
    if (last && s.t - last.t1 < 0.6) { last.n++; last.t1 = s.t; }
    else gr.push({ t0: s.t, t1: s.t, n: 1, alive0: s.alive, clearT: s.clearT });
  }
  return gr;
}

(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  let bad = 0;
  for (const assist of [true, false]) {
    const { L, errors } = await run(browser, "waves", { assist, spawn: "normal" });
    const melee = L.imp.filter(x => x.kind !== "ranged"), byPress = {};
    for (const x of L.imp) (byPress[x.press] = byPress[x.press] || []).push(x.d);
    const rows = Object.keys(byPress).map(Number).sort((a, b) => a - b).filter(k => byPress[k].length >= 2).map(k => `${k > 0 ? "+" : ""}${k}→${med(byPress[k]).toFixed(0)}`);
    // сразу исполненные нажатия (не ждали в буфере, пока герой занят): раннее (−120…−30 мс) должно ударить в долю,
    // позднее — не позже, чем через 25 мс подготовки (+60 мс пути рывка) после исполнения
    const imm = L.imp.filter(x => x.exec - x.press < 40);
    // по расчётному моменту удара (impactSong); исполнение кадрами добавляет свою погрешность — печатается отдельно
    // рывку нужен путь до цели (≥ 45 мс) — он проверяется как «не позже минимума», а не «точно в долю»
    const early = imm.filter(x => x.press >= -120 && x.press <= -30 && x.kind !== "dash").map(x => x.plan);
    const late = imm.filter(x => (x.press > -30 || x.kind === "dash") && x.press >= -120 && x.press <= 60).map(x => x.plan - Math.max(0, x.exec) - (x.kind === "dash" ? 70 : 25));
    const frameErr = L.imp.map(x => x.d - x.plan);
    const buf = L.imp.filter(x => x.exec - x.press >= 40);
    var nearEarly = early, nearLate = late;
    console.log(`\n[подгонка ${assist ? "вкл" : "выкл"}] ударов ${L.imp.length} (ближний ${melee.length}, ждали в буфере ${buf.length}); «в долю» ${L.imp.filter(x => x.onBeat).length}`);
    console.log(`  раннее нажатие −120…−30 мс (кроме рывка): удар от доли медиана ${med(early).toFixed(0)} мс, p90 |${p90(early).toFixed(0)}| (n=${early.length}); нажатие −30…+60 и рывки: удар позже минимума на ${med(late).toFixed(0)} мс (n=${late.length}); факт − расчёт (кадры, замер в rAF): медиана ${med(frameErr).toFixed(0)} мс, p90 |${p90(frameErr).toFixed(0)}|`);
    console.log("  сдвиг нажатия → удар от доли (мс, медиана; погрешность кадра ±16): " + rows.join("  "));
    if (process.env.DBG) console.log(imm.filter(x => x.press <= -30 && x.press >= -120).map(x => [x.press, Math.round(x.plan), x.kind, x.name].join("/")).join(" "));
    if (process.env.DBG) console.log(L.imp.map(x => [x.press, Math.round(x.plan), Math.round(x.d), x.kind[0], +x.ts.toFixed(2)].join("/")).join(" "));
    console.log(`  звуки в долю: заранее ${L.sched}, сразу ${L.now}`);
    console.log(`  шаги: ${L.steps.length}, ошибка фазы медиана ${med(L.steps).toFixed(1)} мс, p90 ${p90(L.steps).toFixed(1)} мс`);
    if (errors.length) { console.log("ERRORS", errors); bad++; }
    if (assist && !(Math.abs(med(nearEarly)) < 25 && p90(nearEarly) < 60 && med(nearLate) < 25)) { console.log("  !! удар не на доле"); bad++; }
  }
  {
    // ровный бег (практика, без врагов): шаги должны вставать на доли/половины долей
    const page = await browser.newPage({ viewport: { width: 1100, height: 560 } });
    await page.goto("file://" + path.join(__dirname, "../index.html"));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__game.startBattle("practice"));
    await page.waitForFunction(() => window.__game.state === "battle", null, { timeout: 60000 });
    const errs = await page.evaluate(async () => {
      const g = window.__game, out = [];
      const sfx = g.sfx.bind(g);
      let run = 0;
      g.sfx = (n, a, b) => {
        if (n === "step" && ++run > 3) { const c = g.clock, f = ((c.idx + c.phase) * 2) % 1; out.push(Math.min(f, 1 - f) * c.period / 2 * 1000); }
        return sfx(n, a, b);
      };
      for (let k = 0; k < 4; k++) {
        run = 0; g.input.keys.add(k % 2 ? "KeyA" : "KeyD");
        await new Promise(r => setTimeout(r, 2500));
        g.input.keys.delete("KeyA"); g.input.keys.delete("KeyD");
        await new Promise(r => setTimeout(r, 300));
      }
      return out;
    });
    await page.close();
    console.log(`\n[ровный бег] шагов ${errs.length}: от доли/полудоли медиана ${med(errs).toFixed(1)} мс, p90 ${p90(errs).toFixed(1)} мс`);
    if (!(errs.length > 20 && med(errs) < 20)) { console.log("  !! шаги не на долях"); bad++; }
  }
  for (const [mode, spawn] of [["waves", "few"], ["waves", "normal"], ["waves", "many"], ["track", "normal"]]) {
    const { L, errors } = await run(browser, mode, { assist: true, spawn });
    const gr = spawnStats(L);
    const overlap = gr.filter(x => x.alive0 > 0).length;
    const delays = gr.slice(1).map(x => x.clearT);
    console.log(`\n[${mode} · ${spawn}] групп ${gr.length}: размеры ${gr.map(x => x.n).join(",")}; появились при живых врагах: ${overlap}; задержка после зачистки медиана ${med(delays).toFixed(2)} с (мин ${Math.min(...delays).toFixed(2)}, макс ${Math.max(...delays).toFixed(2)})`);
    if (errors.length) { console.log("ERRORS", errors); bad++; }
    if (overlap) { console.log("  !! группа появилась, пока живы прежние"); bad++; }
  }
  await browser.close();
  console.log(bad ? `\nПРОБЛЕМ: ${bad}` : "\nвсё в норме");
  process.exit(bad ? 1 : 0);
})();
