const { createRequire } = require("node:module");
const req = createRequire(process.argv[2] + "/package.json");
const { transformSync } = req("@babel/core");
const plugin = req("babel-plugin-react-compiler");
const file = process.argv[3]; const events = [];
transformSync(require("fs").readFileSync(file, "utf8"), { filename: file, babelrc: false, configFile: false,
  presets: [req("@babel/preset-typescript")].filter(Boolean).length ? [[req.resolve("@babel/preset-typescript"), { isTSX: true, allExtensions: true }]] : [],
  plugins: [[plugin, { logger: { logEvent: (f, e) => events.push(e.kind + (e.fnLoc ? "@" + e.fnLoc.start.line : "") + (e.reason ? ":" + e.reason : "")) } }]] });
console.log(events.length ? events.join("\n") : "no events: compiler saw no component/hook functions");
