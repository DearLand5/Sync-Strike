// Готовит версию index.html для публикации как Artifact на claude.ai:
// убирает doctype/html/head/body и мету charset/viewport (их добавляет обёртка), <title> — первой строкой.
// node tools/make-artifact.js <out.html>
const fs = require("fs"), path = require("path");
const out = process.argv[2];
if (!out) { console.error("usage: node tools/make-artifact.js <out.html>"); process.exit(1); }
let s = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
for (const re of [/<!doctype html>\n/i, /<html lang="ru">\n/, /<head>\n/, /<\/head>\n/, /<body>\n/, /<\/body>\n/, /<\/html>\n?/, /<meta charset="utf-8">\n/, /<meta name="viewport"[^>]*>\n/]) s = s.replace(re, "");
const title = s.match(/<title>.*?<\/title>\n/)[0];
s = title + s.replace(title, "");
fs.writeFileSync(out, s);
console.log("artifact page:", out, (s.length / 1024).toFixed(1), "KB");
