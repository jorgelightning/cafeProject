// Lint for the app's classic scripts. They share one global scope through <script> tags (config,
// core, storage, ... boot), so a function defined in one file is "undefined" to ESLint in
// another. The names below are read from the files themselves: every top-level function, const,
// let and var in js/*.js is a known global, so `no-undef` still catches a real typo or a
// forgotten script.
const js = require("@eslint/js");
const globals = require("globals");
const fs = require("fs");
const path = require("path");

const appGlobals = {};
for (const f of fs.readdirSync(path.join(__dirname, "js"))) {
  if (!f.endsWith(".js")) continue;
  const src = fs.readFileSync(path.join(__dirname, "js", f), "utf8");
  for (const m of src.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) appGlobals[m[1]] = "readonly";
  // top-level const/let/var, possibly several names over several lines: "let a = [], b = 2,\n c;"
  for (const m of src.matchAll(/^(?:const|let|var)\s+/gm)) {
    let depth = 0,
      quote = "",
      names = [],
      i = m.index + m[0].length,
      start = true;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (quote) {
        if (ch === "\\") i++;
        else if (ch === quote) quote = "";
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        continue;
      }
      if ("([{".includes(ch)) depth++;
      else if (")]}".includes(ch)) depth--;
      else if (ch === ";" && depth === 0) break;
      else if (ch === "," && depth === 0) {
        start = true;
        continue;
      }
      if (start && /[A-Za-z_$]/.test(ch)) {
        const id = /^[A-Za-z_$][\w$]*/.exec(src.slice(i))[0];
        names.push(id);
        i += id.length - 1;
        start = false;
      } else if (start && /\S/.test(ch)) start = false; // destructuring etc.: skip
    }
    for (const n of names) appGlobals[n] = "writable";
  }
}

module.exports = [
  { ignores: ["node_modules/**", "vendor/**", "tests/**", "overnight-cafe-audit.html"] },
  {
    files: ["js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        firebase: "readonly",
        google: "readonly",
        markerClusterer: "readonly",
        ...appGlobals,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      // Redeclaring a global the file defines itself is how these scripts share state: every file
      // "declares" the globals it owns, so no-redeclare would fire on the design, not on a mistake.
      "no-redeclare": "off",
      // top-level functions are called from inline onclick="..." in the HTML, so they look unused
      "no-unused-vars": ["warn", { vars: "local", args: "none", caughtErrors: "none" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["server.js", "eslint.config.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "commonjs", globals: globals.node },
    rules: { ...js.configs.recommended.rules },
  },
];
