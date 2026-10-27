/* The unit tests (tests/unit/*.test.mjs): the pure helpers in js/lib/, run by Node's own test runner with no browser
   and no server. On their own: npm run test:unit. Here so `npm test` runs them with everything else. */
const { spawnSync } = require("child_process");
const path = require("path");
/* node --test takes a glob, not a folder, and wants forward slashes for it on Windows too */
const glob = path.join(__dirname, "unit", "*.test.mjs").split(path.sep).join("/");
const r = spawnSync(process.execPath, ["--test", "--test-reporter=spec", glob], { encoding: "utf8" });
const out = (r.stdout || "") + (r.stderr || "");
const n = /ℹ tests (\d+)/.exec(out),
  f = /ℹ fail (\d+)/.exec(out);
if (r.status === 0 && n && +n[1] > 0) console.log("all " + n[1] + " passed");
else console.log(out + "\n" + (f ? f[1] : "?") + " FAILED" + (n && +n[1] === 0 ? " (no unit tests were found)" : ""));
process.exit(r.status === 0 && n && +n[1] > 0 ? 0 : 1);
