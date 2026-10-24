// Ручная настройка Режиссёра (экран «Режиссёр»): node tools/director-ui-test.js [outDir]
// Демо-трек: режимы Авто/Вручную/Выкл, чувствительность, контекстные панели (играет — отметки на слух, пауза — выбранная часть),
// масштаб карты (кнопки, колесо, щипок двумя пальцами), перетаскивание границы без шага и с магнитом, точное время начала/конца
// (ввод и кнопки ◂ ▸ с удержанием), разрезать/убрать, отмена/возврат, клавиши, предпросмотр, сохранение, темп 125%, бой, 800×380, телефон.
const { chromium } = require(process.env.PW || "playwright");
const path = require("path"), fs = require("fs"), os = require("os");
const out = process.argv[2] || path.join(__dirname, "../.shots");
fs.mkdirSync(out, { recursive: true });

(async () => {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-dirui-"));
  const ctx = await chromium.launchPersistentContext(userDir, { viewport: { width: 1100, height: 560 }, args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  const url = "file://" + path.join(__dirname, "../index.html");
  const fails = [];
  const check = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg); if (!ok) fails.push(msg); };
  const st = () => page.evaluate(() => {
    const g = window.__game, t = g.track;
    return { mode: t.director.mode, sens: t.director.sens, secs: t.map.sections.map(s => s.kind + "@" + s.start.toFixed(3)), clockSecs: g.clock.map.sections.length,
      off: !!t.map.directorOff, sel: g.ui._dirSel, bars: !!(t.base.map.bars && t.base.map.bars.B), z: g.ui._dirView.z, x0: g.ui._dirView.x0,
      live: !document.getElementById("dir-live").hidden, part: !document.getElementById("dir-part").hidden };
  });
  const startOf = (s, i) => parseFloat(s.secs[i].split("@")[1]);
  const open = async () => {
    await page.goto(url);
    await page.waitForFunction(() => window.__game && window.__game.library.ok !== undefined);
    await page.evaluate(() => window.__game.library.ready);
    await page.evaluate(() => window.__game.ui.show("music"));
    await page.click("#btn-demo");
    await page.waitForFunction(() => window.__game.track && !window.__game.loading, null, { timeout: 60000 });
    await page.evaluate(() => window.__game.ui.show("director"));
  };
  const pause = async () => { await page.evaluate(() => { const a = window.__game.audio; if (a.playing) a.pause(); }); await page.waitForTimeout(80); };
  const shot = async name => { await page.evaluate(() => document.getElementById("dir-card").scrollIntoView({ block: "start" })); await page.screenshot({ path: path.join(out, name) }); };
  const more = async () => page.evaluate(() => { document.getElementById("dir-more").open = true; });

  await open();
  let s = await st();
  check(s.mode === "auto" && s.bars, "по умолчанию авто, в карте есть такты");
  const autoN = s.secs.length;
  await shot("dir-auto-1100.png");

  // чувствительность
  await page.click("#dir-sens-p"); await page.click("#dir-sens-p");
  const moreS = await st();
  for (let i = 0; i < 4; i++) await page.click("#dir-sens-m");
  const lessS = await st();
  check(moreS.sens === 2 && lessS.sens === -2, "чувствительность −2..+2");
  check(moreS.secs.length >= autoN && lessS.secs.length <= autoN, `чаще → не меньше частей, реже → не больше (${lessS.secs.length}/${autoN}/${moreS.secs.length})`);
  await page.click("#dir-sens-p"); await page.click("#dir-sens-p");

  // вручную: копия анализа, на паузе — панель выбранной части
  await page.click('#dir-mode button[data-m="manual"]');
  s = await st();
  check(s.mode === "manual" && s.secs.length === autoN, "вручную — копия частей анализа");
  check(s.part && !s.live, "на паузе видна панель выбранной части, отметки на слух скрыты");
  const box = await page.locator("#dir-map").boundingBox();
  const dur = await page.evaluate(() => window.__game.track.base.map.duration);
  const sec1 = await page.evaluate(() => { const m = window.__game.track.map.sections[1]; return (m.start + m.end) / 2; });
  await page.mouse.click(box.x + box.width * sec1 / dur, box.y + box.height * 0.3);
  s = await st();
  check(s.sel === 1, "нажатие на карту выбирает часть");
  await page.click('#dir-kinds button[data-k="break"]'); s = await st();
  check(s.secs[1].startsWith("break"), "характер части: " + s.secs[1]);
  const n0 = s.secs.length;
  await page.click("#dir-split"); s = await st();
  check(s.secs.length === n0 + 1 && s.sel === 2, "разрезать: +1 часть, выбрана правая");
  await page.click("#dir-del"); s = await st();
  check(s.secs.length === n0 && s.sel === 1, "убрать часть: обратно " + n0);

  // точное время: ввод начала с миллисекундами
  await page.fill("#dir-s", "0:07.123"); await page.press("#dir-s", "Enter"); s = await st();
  check(Math.abs(startOf(s, 1) - 7.123) < 0.0015, "ввод начала 0:07.123 → " + s.secs[1]);
  await page.fill("#dir-e", "0:25.5"); await page.press("#dir-e", "Enter"); s = await st();
  check(Math.abs(startOf(s, 2) - 25.5) < 0.0015, "ввод конца двигает начало следующей: " + s.secs[2]);
  await page.fill("#dir-s", "абв"); await page.press("#dir-s", "Enter"); s = await st();
  check(Math.abs(startOf(s, 1) - 7.123) < 0.0015, "неверный ввод ничего не ломает");
  // кнопки ◂ ▸: одно нажатие — 10 мс; удержание — быстрее и одной записью в истории
  await page.click("#dir-s-p"); s = await st();
  check(Math.abs(startOf(s, 1) - 7.133) < 0.0015, "▸ — +10 мс: " + s.secs[1]);
  const hist0 = await page.evaluate(() => window.__game.ui._dirHist.back.length);
  const bp = await page.locator("#dir-s-p").boundingBox();
  await page.mouse.move(bp.x + bp.width / 2, bp.y + bp.height / 2); await page.mouse.down(); await page.waitForTimeout(1000); await page.mouse.up();
  s = await st();
  const hist1 = await page.evaluate(() => window.__game.ui._dirHist.back.length);
  check(startOf(s, 1) > 7.2, "удержание ▸ ускоряется: " + s.secs[1]);
  check(hist1 - hist0 <= 1, "удержание — одна запись в «Отменить»");

  // масштаб: кнопка, колесо
  await page.click("#dir-zin"); s = await st();
  check(Math.abs(s.z - 2) < 0.01, "«+» — масштаб ×2");
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4);
  await page.mouse.wheel(0, -600); await page.waitForTimeout(100); s = await st();
  check(s.z > 4, "колесо — приближает: ×" + s.z.toFixed(1));
  // граница при сильном увеличении тянется без шага (магнит выключен)
  await more(); await page.click('#dir-snap button[data-g="free"]');
  await page.evaluate(() => document.getElementById("dir-card").scrollIntoView({ block: "start" }));
  const box2 = await page.locator("#dir-map").boundingBox();
  await page.evaluate(() => { const u = window.__game.ui, t = window.__game.track; u._dirView.z = 20; u._dirClampView(); u._dirView.x0 = t.director.secs[1].s - u._dirSpan() / 2; u._dirClampView(); u.drawDirector(); });
  const b1 = await page.evaluate(() => window.__game.track.director.secs[1].s);
  const vw = await page.evaluate(() => ({ x0: window.__game.ui._dirView.x0, span: window.__game.ui._dirSpan() }));
  const bx = box2.x + (b1 - vw.x0) / vw.span * box2.width, by = box2.y + box2.height * 0.5;
  await page.mouse.move(bx, by); await page.mouse.down(); await page.mouse.move(bx + 7, by, { steps: 4 }); await page.mouse.move(bx + 13, by, { steps: 4 }); await page.mouse.up();
  const b2 = await page.evaluate(() => window.__game.track.director.secs[1].s);
  const expect = 13 / box2.width * vw.span;
  check(Math.abs((b2 - b1) - expect) < 0.03, `без магнита граница сдвигается плавно: +${((b2 - b1) * 1000).toFixed(0)} мс (ожидалось ≈${(expect * 1000).toFixed(0)})`);
  // с магнитом «Такт» — прилипает к такту рядом с линией
  await page.click('#dir-snap button[data-g="bar"]');
  await page.evaluate(() => { const u = window.__game.ui; u._dirView.z = 1; u._dirClampView(); u._dirView.x0 = 0; u.drawDirector(); });
  const edges = await page.evaluate(() => window.__game.track.base.map.bars.edges);
  const c1 = await page.evaluate(() => window.__game.track.director.secs[1].s);
  const target = edges.find(e => e > c1 + 3);
  const xa = box2.x + c1 / dur * box2.width, xb = box2.x + (target + 0.05) / dur * box2.width;
  await page.mouse.move(xa, by); await page.mouse.down(); await page.mouse.move((xa + xb) / 2, by, { steps: 4 }); await page.mouse.move(xb, by, { steps: 4 }); await page.mouse.up();
  const c2 = await page.evaluate(() => window.__game.track.director.secs[1].s);
  check(Math.abs(c2 - target) < 0.001, `магнит «Такт» притягивает к такту: ${c2.toFixed(3)} (такт ${target.toFixed(3)})`);
  await shot("dir-part-1100.png");

  // разметка на слух: играет — видна панель отметок
  await page.click("#dir-clear"); s = await st();
  check(s.secs.length === 1, "«Начать с нуля» — одна часть");
  await page.evaluate(() => { const a = window.__game.audio; a.seek(25.1 + 0.35); if (!a.playing) a.play(25.1 + 0.35); });
  await page.waitForTimeout(200); s = await st();
  check(s.live && !s.part, "играет — видны отметки на слух, панель части скрыта");
  await page.click('#dir-mark button[data-k="drop"]'); s = await st();
  check(s.secs.length === 2 && s.secs[1].startsWith("drop") && Math.abs(startOf(s, 1) - 25.1) < 0.6, "«+ Дроп» во время игры: " + s.secs[1]);
  await page.evaluate(() => window.__game.audio.seek(58.2 + 0.3)); await page.waitForTimeout(150);
  await page.keyboard.press("Digit5"); s = await st();
  check(s.secs.length === 3 && s.secs[2].startsWith("break"), "клавиша 5 во время игры — брейк: " + s.secs[2]);
  await shot("dir-live-1100.png");
  // пауза — выбрана часть под курсором
  await pause(); await page.waitForTimeout(100); s = await st();
  check(s.part && s.sel === 2, "пауза — панель части, выбрана часть под курсором");
  await page.keyboard.press("Digit3"); s = await st();
  check(s.secs.length === 2 && s.secs[1].startsWith("drop"), "на паузе клавиша 3 меняет характер выбранной части (брейк → дроп, слился с соседним дропом)");
  await page.keyboard.press("Control+KeyZ"); s = await st();
  check(s.secs.length === 3 && s.secs[2].startsWith("break"), "Ctrl+Z отменяет");
  await page.keyboard.press("Alt+ArrowRight"); s = await st();
  check(Math.abs(startOf(s, 2) - 58.2) < 0.7, "Alt+→ — сдвиг начала на 10 мс");
  await page.click("#dir-undo"); await page.click("#dir-undo"); await page.click("#dir-undo"); s = await st();
  check(s.secs.length === 1, "«↶» ×3 — снова одна часть");
  await page.click("#dir-redo"); await page.click("#dir-redo"); s = await st();
  check(s.secs.length === 3, "«↷» ×2 — разметка вернулась");

  // предпросмотр
  await page.click("#dir-preview"); await page.waitForTimeout(400);
  const pv = await page.evaluate(() => ({ panel: document.getElementById("scr-director").hidden, bar: !document.getElementById("dir-pv").hidden, play: window.__game.audio.playing }));
  await page.screenshot({ path: path.join(out, "dir-preview-1100.png") });
  check(pv.panel && pv.bar && pv.play, "предпросмотр: панель скрыта, трек играет");
  await page.click("#dir-pv-back"); await pause();

  // сохранение после перезагрузки
  s = await st(); const before = s.secs.join(",");
  await open(); s = await st();
  check(s.mode === "manual" && s.secs.join(",") === before, "ручная разметка сохранилась после перезагрузки");
  // темп 125%: части масштабируются, поля времени — во времени трека
  await page.evaluate(() => window.__game.applyTempo({ rate: 1.25, keep: false, fix: { k: 0, half: false, shift: 0 } }));
  await page.waitForFunction(() => !window.__game.loading && window.__game.track.tempo.rate === 1.25, null, { timeout: 60000 });
  const tm = await page.evaluate(() => { const t = window.__game.track, u = window.__game.ui; u._dirSel = 1; u.refreshDirector(); return { a: t.map.sections.map(s => s.start), b: u._dirSecs().map(s => s.start), inp: document.getElementById("dir-s").value }; });
  check(tm.a.every((v, i) => Math.abs(v * 1.25 - tm.b[i]) < 0.01), "темп 125%: части масштабированы");
  check(tm.inp === (() => { const v = tm.b[1] / 1.25, m = Math.floor(v / 60), x = v - m * 60; return m + ":" + (x < 10 ? "0" : "") + x.toFixed(3); })(), "поле «Начало» — во времени трека с темпом: " + tm.inp);
  await page.evaluate(() => window.__game.applyTempo({ rate: 1, keep: true, fix: { k: 0, half: false, shift: 0 } }));
  await page.waitForFunction(() => !window.__game.loading && window.__game.track.tempo.rate === 1, null, { timeout: 60000 });
  // выкл и обратно
  await page.click('#dir-mode button[data-m="off"]'); s = await st();
  check(s.off && s.secs.length === 1, "выкл — одна часть без эффектов");
  await page.click('#dir-mode button[data-m="manual"]'); s = await st();
  check(s.secs.join(",") === before, "после «Выкл» ручная разметка на месте");
  // в бою заблокировано
  await page.evaluate(() => window.__game.startBattle("track")); await page.waitForTimeout(500);
  const battle = await page.evaluate(() => ({ ok: !window.__game.applyDirector({ mode: "auto" }), n: window.__game.clock.map.sections.length }));
  check(battle.ok && battle.n === s.secs.length, "в бою — ручные части, настройку не применить");
  await page.evaluate(() => window.__game.toMenu());

  // низкий экран
  await page.setViewportSize({ width: 800, height: 380 });
  await page.evaluate(() => window.__game.ui.show("director")); await page.waitForTimeout(200);
  await shot("dir-part-800x380.png");
  const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || [...document.querySelectorAll("#dir-card *")].some(e => e.offsetParent && e.getBoundingClientRect().right > window.innerWidth + 1));
  check(!over, "800×380: без горизонтального вылета");
  await page.evaluate(() => window.__game.ui.show("menu")); await page.waitForTimeout(150);
  const menuFit = await page.evaluate(() => [...document.querySelectorAll("#scr-menu .menu-item")].filter(e => !e.hidden).every(e => { const r = e.getBoundingClientRect(); return r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1; }));
  check(menuFit, "800×380: все пункты меню на экране");
  await page.click('#scr-menu [data-go="director"]');
  await page.click("#dir-back");
  check(await page.evaluate(() => window.__game.ui.screen === "menu"), "«Назад» возвращает в меню");
  check(!errors.length, "без ошибок (ПК)" + (errors.length ? ": " + errors.join(" | ") : ""));
  await ctx.close();

  // ---- телефон: касания, щипок двумя пальцами, перетаскивание ручки пальцем (интерфейс повёрнут в портрете) ----
  const br = await chromium.launch();
  const mctx = await br.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const mp = await mctx.newPage();
  const merr = [];
  mp.on("pageerror", e => merr.push(e.message));
  await mp.goto(url);
  await mp.waitForFunction(() => window.__game);
  await mp.evaluate(async () => { const g = window.__game; await g.library.ready; await g.loadDemo(); g.ui.show("director"); });
  await mp.waitForFunction(() => window.__game.track && !window.__game.loading);
  await mp.tap('#dir-mode button[data-m="manual"]');
  const rot = await mp.evaluate(() => document.getElementById("app").classList.contains("rot"));
  const cdp = await mctx.newCDPSession(mp);
  // экранные координаты точки карты (u — доля ширины карты, v — доля высоты) с учётом поворота интерфейса
  const mapPt = async (u, v) => mp.evaluate(([u, v]) => {
    const cv = document.getElementById("dir-map"), r = cv.getBoundingClientRect(), rot = document.getElementById("app").classList.contains("rot");
    return rot ? { x: r.right - v * r.width, y: r.top + u * r.height } : { x: r.left + u * r.width, y: r.top + v * r.height };
  }, [u, v]);
  const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  // щипок: пальцы расходятся от 40%/60% к 20%/80% ширины карты
  let a1 = await mapPt(0.4, 0.4), a2 = await mapPt(0.6, 0.4);
  await touch("touchStart", [a1, a2]);
  for (let k = 1; k <= 6; k++) { const p1 = await mapPt(0.4 - 0.2 * k / 6, 0.4), p2 = await mapPt(0.6 + 0.2 * k / 6, 0.4); await touch("touchMove", [p1, p2]); }
  await touch("touchEnd", []);
  const mz = await mp.evaluate(() => window.__game.ui._dirView.z);
  check(mz > 2.5 && mz < 3.5, `телефон${rot ? " (поворот)" : ""}: щипок двумя пальцами — масштаб ×${mz.toFixed(2)} (ожидалось ≈3)`);
  // перетаскивание ручки границы пальцем
  await mp.evaluate(() => { const u = window.__game.ui; u._dirView.z = 1; u._dirView.x0 = 0; window.__game.settings.set("dirSnap", "free"); u.refreshDirector(); });
  const mi = await mp.evaluate(() => { const t = window.__game.track; return { s: t.director.secs[1].s, dur: t.base.map.duration }; });
  const h0 = await mapPt(mi.s / mi.dur + 0.01, 0.85), h1 = await mapPt(mi.s / mi.dur + 0.06, 0.85);
  await touch("touchStart", [h0]);
  for (let k = 1; k <= 6; k++) await touch("touchMove", [{ x: h0.x + (h1.x - h0.x) * k / 6, y: h0.y + (h1.y - h0.y) * k / 6 }]);
  await touch("touchEnd", []);
  const ms2 = await mp.evaluate(() => window.__game.track.director.secs[1].s);
  check(ms2 - mi.s > 0.03 * mi.dur, `телефон: ручка границы тянется пальцем: ${mi.s.toFixed(2)} → ${ms2.toFixed(2)}`);
  await mp.screenshot({ path: path.join(out, "dir-phone.png") });
  check(!merr.length, "без ошибок (телефон)" + (merr.length ? ": " + merr.join(" | ") : ""));
  await br.close();

  console.log(fails.length ? `ПРОВАЛЕНО: ${fails.length}` : "всё прошло");
  process.exit(fails.length ? 1 : 0);
})();
