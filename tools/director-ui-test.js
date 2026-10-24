// Ручная настройка Режиссёра (отдельный экран «Режиссёр»): node tools/director-ui-test.js [outDir]
// Демо-трек: режимы Авто/Вручную/Выкл, чувствительность, правка частей, сохранение после перезагрузки, темп 125%, бой.
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
    return { mode: t.director.mode, sens: t.director.sens, secs: t.map.sections.map(s => s.kind + "@" + s.start.toFixed(1)), clockSecs: g.clock.map.sections.length,
      off: !!t.map.directorOff, info: document.getElementById("dir-info").textContent, sel: g.ui._dirSel, bars: !!(t.base.map.bars && t.base.map.bars.B) };
  });
  const open = async () => {
    await page.goto(url);
    await page.waitForFunction(() => window.__game && window.__game.library.ok !== undefined);
    await page.evaluate(() => window.__game.library.ready);
    await page.evaluate(() => window.__game.ui.show("music"));
    await page.click("#btn-demo");
    await page.waitForFunction(() => window.__game.track && !window.__game.loading, null, { timeout: 60000 });
    await page.evaluate(() => window.__game.ui.show("director"));
  };
  const shot = async name => { await page.evaluate(() => document.getElementById("dir-card").scrollIntoView({ block: "center" })); await page.screenshot({ path: path.join(out, name) }); };

  await open();
  let s = await st();
  console.log("авто:", JSON.stringify(s));
  check(s.mode === "auto" && s.bars, "по умолчанию авто, в карте есть такты");
  const autoN = s.secs.length;
  await shot("dir-auto-1100.png");

  // чувствительность: «чаще» не уменьшает число частей, «реже» не увеличивает
  await page.click("#dir-sens-p"); await page.click("#dir-sens-p");
  const more = await st();
  await page.click("#dir-sens-m"); await page.click("#dir-sens-m"); await page.click("#dir-sens-m"); await page.click("#dir-sens-m");
  const less = await st();
  console.log("частей: реже", less.secs.length, "авто", autoN, "чаще", more.secs.length);
  check(more.sens === 2 && less.sens === -2, "чувствительность −2..+2");
  check(more.secs.length >= autoN && less.secs.length <= autoN, "чаще → не меньше частей, реже → не больше");
  check(more.clockSecs === more.secs.length, "часы получили новую карту");
  await page.click("#dir-sens-p"); await page.click("#dir-sens-p");

  // вручную: разметка копируется из анализа
  await page.click('#dir-mode button[data-m="manual"]');
  s = await st();
  check(s.mode === "manual" && s.secs.length === autoN, "вручную — копия частей анализа");
  // выбрать вторую часть кликом по карте, сделать брейком
  const box = await page.locator("#dir-map").boundingBox();
  const dur = await page.evaluate(() => window.__game.track.base.map.duration);
  const sec1 = await page.evaluate(() => { const m = window.__game.track.map.sections[1]; return (m.start + m.end) / 2; });
  await page.mouse.click(box.x + box.width * sec1 / dur, box.y + box.height / 2);
  s = await st();
  check(s.sel === 1, "клик по карте выбирает часть");
  await page.click('#dir-kinds button[data-k="break"]');
  s = await st();
  check(s.secs[1].startsWith("break"), "характер части меняется: " + s.secs[1]);
  // разрезать и объединить
  const n0 = s.secs.length;
  await page.click("#dir-split"); s = await st();
  check(s.secs.length === n0 + 1 && s.sel === 2, "разрезать: +1 часть, выбрана правая");
  await page.click("#dir-prev"); await page.click("#dir-merge"); s = await st();
  check(s.secs.length === n0, "объединить: обратно " + n0);
  // граница на такт раньше
  const b0 = s.secs[1];
  await page.click("#dir-left"); s = await st();
  check(s.secs[1] !== b0, "начало части сдвигается на такт: " + b0 + " → " + s.secs[1]);
  await shot("dir-manual-1100.png");
  // ▶ Отсюда
  await page.click("#dir-play"); await page.waitForTimeout(300);
  const pos = await page.evaluate(() => ({ p: window.__game.audio.playing, t: window.__game.audio.heardPosition(), s: window.__game.track.map.sections[window.__game.ui._dirSel].start }));
  check(pos.p && Math.abs(pos.t - pos.s) < 0.8, "▶ Отсюда — трек играет с начала части");
  await page.click("#dir-pl");

  // сохранение после перезагрузки
  const before = s.secs.join(",");
  await open();
  s = await st();
  check(s.mode === "manual" && s.secs.join(",") === before, "ручная разметка сохранилась после перезагрузки");

  // темп 125%: части масштабируются, разметка не теряется
  await page.evaluate(() => window.__game.applyTempo({ rate: 1.25, keep: false, fix: { k: 0, half: false, shift: 0 } }));
  await page.waitForFunction(() => !window.__game.loading && window.__game.track.tempo.rate === 1.25, null, { timeout: 60000 });
  const tm = await page.evaluate(() => { const t = window.__game.track; return { a: t.map.sections.map(s => s.start), b: window.__game.ui._dirSecs().map(s => s.start), k: t.map.sections.map(s => s.kind).join(","), dk: t.director.secs.map(s => s.k).join(",") }; });
  check(tm.k === tm.dk && tm.a.every((v, i) => Math.abs(v * 1.25 - tm.b[i]) < 0.01), "темп 125%: части ручной разметки масштабированы");
  await page.evaluate(() => window.__game.applyTempo({ rate: 1, keep: true, fix: { k: 0, half: false, shift: 0 } }));
  await page.waitForFunction(() => !window.__game.loading && window.__game.track.tempo.rate === 1, null, { timeout: 60000 });

  // выкл: одна часть, флаг для арены
  await page.click('#dir-mode button[data-m="off"]');
  s = await st();
  check(s.off && s.secs.length === 1, "выкл — одна часть без эффектов");
  await shot("dir-off-1100.png");
  // и обратно вручную — разметка не потерялась
  await page.click('#dir-mode button[data-m="manual"]');
  s = await st();
  check(s.secs.join(",") === before, "после «Выкл» ручная разметка на месте");

  // в бою карточка заблокирована, часы видят ручные части
  await page.evaluate(() => window.__game.startBattle("track"));
  await page.waitForTimeout(500);
  const battle = await page.evaluate(() => ({ ok: !window.__game.applyDirector({ mode: "auto" }), n: window.__game.clock.map.sections.length }));
  check(battle.ok, "в бою настройку не применить");
  check(battle.n === s.secs.length, "в бою — ручные части");
  await page.evaluate(() => window.__game.toMenu());

  // низкий экран
  await page.setViewportSize({ width: 800, height: 380 });
    await page.evaluate(() => { const g = window.__game; g.ui.show("director"); });
  await page.waitForTimeout(200);
  await shot("dir-manual-800x380.png");
  const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || [...document.querySelectorAll("#dir-card *")].some(e => e.getBoundingClientRect().right > window.innerWidth + 1));
  check(!over, "800×380: без горизонтального вылета");

  // главное меню: пункт «Режиссёр», меню помещается на 800×380
  await page.evaluate(() => window.__game.ui.show("menu"));
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(out, "dir-menu-800x380.png") });
  const menuFit = await page.evaluate(() => [...document.querySelectorAll("#scr-menu .menu-item")].filter(e => !e.hidden).every(e => { const r = e.getBoundingClientRect(); return r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1; }));
  check(menuFit, "800×380: все пункты меню (с «Режиссёром») на экране");
  await page.click('#scr-menu [data-go="director"]');
  check(await page.evaluate(() => window.__game.ui.screen === "director"), "из меню открывается экран «Режиссёр»");
  await page.click("#dir-back");
  check(await page.evaluate(() => window.__game.ui.screen === "menu"), "«Назад» возвращает в меню");

  check(!errors.length, "без ошибок" + (errors.length ? ": " + errors.join(" | ") : ""));
  await ctx.close();
  console.log(fails.length ? `ПРОВАЛЕНО: ${fails.length}` : "всё прошло");
  process.exit(fails.length ? 1 : 0);
})();
