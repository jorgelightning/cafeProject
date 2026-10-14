/* Type-checks the app's JavaScript with TypeScript (checkJs; see tsconfig.json and types/*.d.ts).

   It is a ratchet. The scripts were written untyped, so a clean run is not available on day one:
   what is left is mostly document.querySelector() returning a plain Element where the code knows
   better. The count is pinned in types/baseline.json, and this fails the moment it goes UP, so no
   new type error can arrive, and it tells you when you have gone DOWN so the number can follow.

     npm run typecheck             check against the baseline
     npm run typecheck -- --list   show every current error */
const { spawnSync } = require("child_process");
const fs = require("fs"),
  path = require("path");

const root = path.join(__dirname, "..");
const baselinePath = path.join(root, "types", "baseline.json");
const tsc = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
const r = spawnSync(tsc, ["-p", root, "--pretty", "false"], { encoding: "utf8" });
const out = (r.stdout || "") + (r.stderr || "");
const errors = out.split("\n").filter(l => /error TS\d+/.test(l));
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8")).errors;

if (process.argv.includes("--list")) console.log(errors.join("\n"));
console.log("type errors: " + errors.length + " (baseline " + baseline + ")");
if (errors.length > baseline) {
  console.error(
    "\nThis change added " +
      (errors.length - baseline) +
      " type error(s). Run `npm run typecheck -- --list`, fix them, and keep the count at or under the baseline."
  );
  process.exit(1);
}
if (errors.length < baseline) {
  console.log(
    'Down from the baseline: set "errors" in types/baseline.json to ' + errors.length + " to lock the improvement in."
  );
}
