// Библиотека треков и автосохранение: node tools/library-test.js [outDir]
// Треки — синтезированные WAV (щелчки 120 BPM), подаются через <input type=file>, как это делает игрок.
const { chromium } = require(process.env.PW || "playwright");
const path = require("path"), fs = require("fs"), os = require("os");
const out = process.argv[2] || path.join(__dirname, "../.shots");
fs.mkdirSync(out, { recursive: true });

function wav(seconds, bpm, seed) {
  const sr = 22050, n = Math.round(seconds * sr), data = Buffer.alloc(44 + n * 2);
  data.write("RIFF", 0); data.writeUInt32LE(36 + n * 2, 4); data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(sr, 24); data.writeUInt32LE(sr * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write("data", 36); data.writeUInt32LE(n * 2, 40);
  const per = 60 / bpm;
  for (let i = 0; i < n; i++) {
    const t = i / sr, ph = t % per, k = Math.floor(t / per) % 4;
    let v = ph < 0.12 ? Math.sin(2 * Math.PI * (k === 0 ? 55 : 80) * ph) * Math.exp(-ph * 30) * 0.8 : 0;
    v += Math.sin(2 * Math.PI * (220 + seed * 30) * t) * 0.05;
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32000), 44 + i * 2);
  }
  return data;
}

(async () => {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-lib-"));
  const ctx = await chromium.launchPersistentContext(userDir, { viewport: { width: 1100, height: 560 }, args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  const url = "file://" + path.join(__dirname, "../index.html");
  const fails = [];
  const check = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg); if (!ok) fails.push(msg); };
  const idle = () => page.waitForFunction(() => !window.__game.loading, null, { timeout: 60000 });
  const addFile = async (sel, name, buf) => { await page.setInputFiles(sel, { name, mimeType: "audio/wav", buffer: buf }); await page.waitForTimeout(100); await idle(); };

  await page.goto(url);
  await page.waitForFunction(() => window.__game && window.__game.library.ok !== undefined);
  await page.evaluate(() => window.__game.library.ready);
  check(await page.evaluate(() => window.__game.library.ok), "IndexedDB доступна");

  const tracks = [["Alpha.wav", wav(20, 120, 1)], ["Beta.wav", wav(22, 128, 2)], ["Gamma.wav", wav(24, 110, 3)]];
  for (const [n, b] of tracks) await addFile("#file-input", n, b);
  let st = await page.evaluate(() => { const g = window.__game; return { n: g.library.items.length, cur: g.track.meta.name, lib: g.track.meta.libId }; });
  check(st.n === 3 && st.cur === "Gamma" && !!st.lib, `3 трека в библиотеке, текущий Gamma (${JSON.stringify(st)})`);

  await page.evaluate(() => window.__game.ui.show("library"));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/lib-list.png` });
  check(await page.locator("#lib-list .lib-row").count() === 3, "в списке 3 строки");

  // повторное открытие того же файла — без нового анализа и без дубля
  let analyses = 0;
  await page.exposeFunction("__countAnalyze", () => analyses++);
  await page.evaluate(() => { const a = window.__game.analyzer, f = a.analyze.bind(a); a.analyze = (...x) => { window.__countAnalyze(); return f(...x); }; });
  await addFile("#file-input", "Alpha.wav", tracks[0][1]);
  st = await page.evaluate(() => ({ n: window.__game.library.items.length, cur: window.__game.track.meta.name }));
  check(st.n === 3 && st.cur === "Alpha" && analyses === 0, `повтор файла: без дубля и без анализа (${JSON.stringify(st)}, анализов ${analyses})`);

  // выбор из библиотеки
  await page.evaluate(() => window.__game.ui.show("library"));
  await page.locator("#lib-list .lib-row", { hasText: "Beta" }).locator("button", { hasText: "Выбрать" }).click();
  await page.waitForTimeout(100); await idle();
  st = await page.evaluate(() => ({ cur: window.__game.track.meta.name, beats: window.__game.track.map.beats.length, screen: window.__game.ui.screen }));
  check(st.cur === "Beta" && st.beats > 10 && analyses === 0, `выбор Beta из библиотеки без анализа (${JSON.stringify(st)})`);

  // перезапуск игры: последний трек восстанавливается
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.track, null, { timeout: 30000 });
  st = await page.evaluate(() => ({ cur: window.__game.track.meta.name, menu: document.getElementById("menu-track").textContent }));
  check(st.cur === "Beta" && /Beta/.test(st.menu), `после перезапуска выбран Beta (${st.menu})`);

  // автоудаление: лимит 3 трека → четвёртый вытесняет давно не запускавшийся (Gamma), текущий не трогает
  await page.evaluate(() => { window.__game.library.maxTracks = 3; });
  await page.evaluate(() => window.__game.ui.show("music"));
  await addFile("#file-input", "Delta.wav", wav(21, 125, 4));
  st = await page.evaluate(() => ({ names: window.__game.library.list().map(m => m.name), toast: document.getElementById("toast").textContent }));
  check(st.names.length === 3 && !st.names.includes("Gamma") && st.names.includes("Delta"), `автоудаление старого трека (${st.names.join(", ")}; «${st.toast}»)`);

  // ручное удаление (два нажатия)
  await page.evaluate(() => window.__game.ui.show("library"));
  const del = page.locator("#lib-list .lib-row", { hasText: "Alpha" }).locator("button.del");
  await del.click();
  check(await page.locator("#lib-list .lib-row", { hasText: "Alpha" }).count() === 1, "первое нажатие ✕ только просит подтверждение");
  await page.screenshot({ path: `${out}/lib-confirm.png` });
  await page.locator("#lib-list .lib-row", { hasText: "Alpha" }).locator("button.del").click();
  await page.waitForTimeout(150);
  st = await page.evaluate(() => window.__game.library.list().map(m => m.name));
  check(!st.includes("Alpha") && st.length === 2, `Alpha удалён (${st.join(", ")})`);

  // автосохранение «Волны»: контрольная точка волны 3
  await page.evaluate(() => window.__game.ui.show("menu"));
  await page.evaluate(() => window.__game.startBattle("waves"));
  await page.waitForTimeout(500);
  await page.evaluate(() => { const g = window.__game; g.enemies = []; g.waves.queue = []; g.combat.score = 4321; g.combat.kills = 9; g.player.hp = Math.round(g.player.maxHp * 0.6); g.waves.startWave(3); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const g = window.__game; g.combat.score = 9999; g.pause(); g.toMenu(); });
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.track, null, { timeout: 30000 });
  await page.waitForTimeout(200);
  st = await page.evaluate(() => ({ vis: !document.getElementById("menu-continue").hidden, sub: document.getElementById("menu-continue-sub").textContent }));
  check(st.vis && /волна 3/.test(st.sub), `в меню «Продолжить» (${st.sub})`);
  await page.screenshot({ path: `${out}/lib-menu-continue.png` });
  await page.click("#menu-continue");
  await page.waitForFunction(() => window.__game.state === "battle", null, { timeout: 30000 });
  await page.waitForTimeout(1600);
  st = await page.evaluate(() => { const g = window.__game; return { wave: g.waves.wave, score: g.combat.score, kills: g.combat.kills, hp: g.player.hp / g.player.maxHp, mode: g.mode }; });
  check(st.mode === "waves" && st.wave === 3 && st.score === 4321 && st.kills === 9 && Math.abs(st.hp - 0.6) < 0.02, `продолжение с волны 3 со счётом на её начало (${JSON.stringify(st)})`);

  // «До конца трека»: сохранение позиции при паузе
  await page.evaluate(() => window.__game.startBattle("track"));
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__game.pause());
  st = await page.evaluate(() => JSON.parse(localStorage.getItem("syncstrike.autosave")));
  check(st && st.mode === "track" && st.songPos > 1.5, `пауза в «До конца трека» сохраняет позицию (${st && st.songPos.toFixed(2)} с)`);

  // конец боя — автосохранение очищается
  await page.evaluate(() => { const g = window.__game; g.resume(); g.endWin = false; g.finishBattle(); });
  st = await page.evaluate(() => ({ a: localStorage.getItem("syncstrike.autosave"), vis: !document.getElementById("menu-continue").hidden }));
  check(st.a === "null" && !st.vis, "после итогов боя автосохранение удалено");

  // удаление трека автосохранения убирает «Продолжить»
  await page.evaluate(() => window.__game.startBattle("waves"));
  await page.waitForTimeout(400);
  await page.evaluate(() => { const g = window.__game; g.pause(); g.toMenu(); });
  const id = await page.evaluate(() => window.__game.getAutosave().libId);
  await page.evaluate(id => window.__game.deleteTrack(id), id);
  st = await page.evaluate(() => ({ a: window.__game.getAutosave(), vis: !document.getElementById("menu-continue").hidden }));
  check(!st.a && !st.vis, "удаление трека убирает его автосохранение");

  check(errors.length === 0, "ошибок в консоли нет" + (errors.length ? ":\n" + errors.join("\n") : ""));
  await ctx.close();
  fs.rmSync(userDir, { recursive: true, force: true });
  console.log(fails.length ? `\n${fails.length} проверок не прошли` : "\nвсё прошло");
  process.exit(fails.length ? 1 : 0);
})();
