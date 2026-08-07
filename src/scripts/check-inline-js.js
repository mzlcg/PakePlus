const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const files = [
  "index.html",
  "data-management.html",
  "algorithm-config.html",
  "analysis.html",
];

for (const file of files) {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  scripts.forEach((match, index) => {
    const code = match[1].trim();
    if (!code) return;
    new vm.Script(code, { filename: `${file}#script${index + 1}` });
  });
  console.log(`checked ${file}: ${scripts.length} inline script(s)`);
}
