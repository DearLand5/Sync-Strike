// Сборка одного автономного HTML-файла из src/: node tools/build.js
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const dir = path.join(root, "src/js");
const files = fs.readdirSync(dir).filter(f => f.endsWith(".js")).sort();
const js = files.map(f => `/* ==== ${f} ==== */\n` + fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
const tpl = fs.readFileSync(path.join(root, "src/index.template.html"), "utf8");
const out = tpl.replace("/*__JS__*/", () => "(() => {\n" + js + "\n})();");
fs.writeFileSync(path.join(root, "index.html"), out);
console.log("index.html:", (out.length / 1024).toFixed(1), "KB,", files.length, "modules");
