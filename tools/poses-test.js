// Пафосные анимации (10b_poses): node tools/poses-test.js
// 1) Авто за ~1 с до дропа демо-трека (дроп 25,1 с): поза началась, акцент — на входе в дроп, затем idle.
// 2) Колесо с клавиатуры (Q + 2) и пальцем (удержать ★ и потянуть вверх): поза, акцент на доле.
// 3) Прерывание атакой и движением; наезд камеры снят.
// 4) «Только колесо» — без автопоз; «Выкл» — ни авто, ни колеса, кнопка ★ скрыта; «Только авто» — колесо не открывается.
// 5) Авто после зачистки волны. Скриншоты .shots/pose-*.png.
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
  let bad = 0;
  const check = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg); if (!ok) bad++; };
  const wait = ms => page.waitForTimeout(ms);
  const until = (fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

  await page.evaluate(() => {
    const g = window.__game;
    window.__fix = () => { g.player.maxHp = 1e6; g.player.hp = 1e6; g.waves.queue = []; g.waves.pending = []; g.waves.between = 999; for (const e of g.enemies) e.dead = true; g.enemies = []; };
    // журнал поз: старт и акцент в музыкальном времени
    const P = g.poses, st = P.start.bind(P), ac = P._accent.bind(P);
    window.__pl = [];
    P.start = (id, dur, auto) => { window.__pl.push({ ev: "start", id, auto, t: g.songNow, dur }); return st(id, dur, auto); };
    P._accent = (p, a) => { window.__pl.push({ ev: "accent", id: a.id, t: g.songNow, at: a.at }); return ac(p, a); };
  });
  await page.evaluate(() => { window.__game.settings.set("poseMode", "both"); window.__game.startBattle("waves"); });
  await until(() => window.__game.state === "battle", null, 60000);

  // 1) авто перед дропом
  await page.evaluate(() => { window.__fix(); window.__pl.length = 0; window.__game.audio.seek(22.5); });
  const gotAuto = await until(() => window.__pl.some(x => x.ev === "accent"), null, 6000);
  await wait(150);
  await page.screenshot({ path: path.join(shots, "pose-auto.png") });
  const L1 = await page.evaluate(() => ({ pl: window.__pl, drop: window.__game.clock.map.sections.find(s => s.kind === "drop").start, kind: window.__game.clock.kind }));
  const s1 = L1.pl.find(x => x.ev === "start"), a1 = L1.pl.find(x => x.ev === "accent");
  check(gotAuto && s1 && s1.auto, `авто: поза «${s1 && s1.id}» за ${s1 ? (L1.drop - s1.t).toFixed(2) : "?"} с до дропа`);
  check(a1 && Math.abs(a1.at - L1.drop) < 0.04, `авто: акцент запланирован на дроп (${a1 ? ((a1.at - L1.drop) * 1000).toFixed(0) : "?"} мс), факт ${a1 ? ((a1.t - L1.drop) * 1000).toFixed(0) : "?"} мс (кадр)`);
  await until(() => window.__game.player.state !== "pose", null, 3000);
  check(await page.evaluate(() => window.__game.player.state === "idle" && !window.__game.poses.focus), "авто: после позы — idle, камера отпущена");

  // 2) колесо с клавиатуры: Q, затем 2 (вихрь)
  await page.evaluate(() => { window.__fix(); window.__pl.length = 0; window.__game.audio.seek(40); });
  await wait(300);
  await page.keyboard.down("KeyQ");
  await wait(120);
  check(await page.evaluate(() => window.__game.input.wheel.open), "колесо: Q открывает");
  await page.screenshot({ path: path.join(shots, "pose-wheel.png") });
  await page.keyboard.press("Digit2");
  await page.keyboard.up("KeyQ");
  await until(() => window.__pl.some(x => x.ev === "start"), null, 2000);
  const kb = await page.evaluate(() => ({ st: window.__game.player.state, pl: window.__pl.slice(), open: window.__game.input.wheel.open }));
  check(kb.st === "pose" && kb.pl[0] && kb.pl[0].id === "cape" && !kb.pl[0].auto && !kb.open, `колесо: клавиша 2 → поза «${kb.pl[0] && kb.pl[0].id}», колесо закрыто`);
  await until(() => window.__pl.some(x => x.ev === "accent"), null, 3000);
  const onBeat = await page.evaluate(() => { const a = window.__pl.find(x => x.ev === "accent"), b = window.__game.clock.map.beats; let d = 1e9; for (const x of b) d = Math.min(d, Math.abs(x - a.at)); return d; });
  check(onBeat < 0.03, `колесо: акцент на доле (${(onBeat * 1000).toFixed(0)} мс)`);
  await until(() => window.__game.player.state !== "pose", null, 3000);

  // 2б) колесо пальцем: держим ★, тянем вверх (клинок к небу), отпускаем
  await page.evaluate(() => { window.__pl.length = 0; window.__game.input.usingTouch = true; });
  const btn = await page.evaluate(() => { const b = window.__game.input.touch.btn.pose; return { x: b.x, y: b.y, on: window.__game.input.touch.on("pose") }; });
  check(btn.on, "кнопка ★ видна при «Авто + колесо»");
  const tp = (type, x, y) => page.evaluate(([type, x, y]) => {
    const cv = window.__game.canvas, r = cv.getBoundingClientRect();
    cv.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: "touch", clientX: r.left + x, clientY: r.top + y, bubbles: true }));
  }, [type, x, y]);
  await tp("pointerdown", btn.x, btn.y); await wait(60);
  await tp("pointermove", btn.x, btn.y - 20); await wait(30);
  await tp("pointermove", btn.x - 2, btn.y - 60); await wait(60);
  const sel = await page.evaluate(() => window.__game.input.wheel.sel);
  await page.screenshot({ path: path.join(shots, "pose-wheel-touch.png") });
  await tp("pointerup", btn.x - 2, btn.y - 60);
  await until(() => window.__pl.some(x => x.ev === "start"), null, 2000);
  const tch = await page.evaluate(() => window.__pl.slice());
  check(sel === 0 && tch[0] && tch[0].id === "sky", `колесо пальцем: сектор ${sel} → поза «${tch[0] && tch[0].id}»`);
  // тап без направления: колесо остаётся, касание по сектору (вниз — колено) выбирает
  await until(() => window.__game.player.state !== "pose", null, 3000);
  await page.evaluate(() => { window.__pl.length = 0; });
  await tp("pointerdown", btn.x, btn.y); await wait(40); await tp("pointerup", btn.x, btn.y); await wait(60);
  const w2 = await page.evaluate(() => { const w = window.__game.input.wheel; return { open: w.open, sticky: w.sticky, x: w.x, y: w.y }; });
  check(w2.open && w2.sticky, "колесо: короткий тап — остаётся открытым");
  await tp("pointerdown", w2.x, w2.y + 60); await wait(30); await tp("pointerup", w2.x, w2.y + 60);
  await until(() => window.__pl.some(x => x.ev === "start"), null, 2000);
  check(await page.evaluate(() => window.__pl[0] && window.__pl[0].id === "kneel"), "колесо: касание сектора вниз → «Перед бурей»");

  // 3) прерывание: атака и движение
  await wait(200);
  await page.keyboard.press("KeyJ");
  await wait(120);
  const cut = await page.evaluate(() => ({ st: window.__game.player.state, pa: window.__game.player.poseAct, f: window.__game.poses.focus }));
  check(cut.st !== "pose" && !cut.pa && !cut.f, `прерывание атакой: состояние ${cut.st}, камера отпущена`);
  await wait(500);
  await page.evaluate(() => window.__game.poses.request("gun"));
  await wait(150);
  await page.keyboard.down("KeyD"); await wait(150); await page.keyboard.up("KeyD");
  check(await page.evaluate(() => window.__game.player.state !== "pose"), "прерывание движением");

  // 4) режимы
  await page.evaluate(() => { window.__game.settings.set("poseMode", "wheel"); window.__fix(); window.__pl.length = 0; window.__game.audio.seek(22.5); });
  await wait(3200);
  check(await page.evaluate(() => !window.__pl.some(x => x.auto)), "«Только колесо»: перед дропом автопозы нет");
  await page.evaluate(() => { window.__game.settings.set("poseMode", "off"); window.__pl.length = 0; });
  await page.keyboard.down("KeyQ"); await wait(80);
  const off = await page.evaluate(() => ({ open: window.__game.input.wheel.open, req: window.__game.poses.request("sky"), btn: window.__game.input.touch.on("pose") }));
  await page.keyboard.up("KeyQ");
  check(!off.open && !off.req && !off.btn, "«Выкл»: колесо не открывается, кнопка ★ скрыта, вызов отклонён");
  await page.evaluate(() => { window.__fix(); window.__game.audio.seek(22.5); });
  await wait(3200);
  check(await page.evaluate(() => !window.__pl.length), "«Выкл»: перед дропом автопозы нет");
  await page.evaluate(() => window.__game.settings.set("poseMode", "auto"));
  await page.keyboard.down("KeyQ"); await wait(80);
  check(await page.evaluate(() => !window.__game.input.wheel.open && !window.__game.input.touch.on("pose")), "«Только авто»: колесо не открывается, кнопки нет");
  await page.keyboard.up("KeyQ");

  // 5) авто после зачистки волны
  await page.evaluate(() => {
    const g = window.__game; window.__pl.length = 0;
    g.poses.waveDone = 0; g.waves.between = 0; g.waves.queue = []; g.waves.pending = []; g.waves.wave = 1;
    g.audio.seek(40);
  });
  const gotWave = await until(() => window.__pl.some(x => x.ev === "start" && x.auto), null, 6000);
  check(gotWave, "авто после зачистки волны");

  await browser.close();
  console.log(errors.length ? "ОШИБКИ:\n" + errors.join("\n") : "без ошибок страницы");
  if (errors.length) bad++;
  console.log(bad ? `ПРОБЛЕМ: ${bad}` : "всё в норме");
  process.exit(bad ? 1 : 0);
})();
