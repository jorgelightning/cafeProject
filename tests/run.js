/* Runs every test file and reports one line each. Exit code is non-zero if anything failed,
   so this works as a pre-push check. Add a file to tests/ and list it here. */
"use strict";
const { spawnSync } = require("child_process");
const path = require("path");

const SUITE = [
  ["cache-version",     "the deploy versions agree and a stale build cannot pin itself"],
  ["currency-units",   "conversion, rounding and the country->currency table (no browser)"],
  ["currency-form",    "logging a drink in local money, end to end"],
  ["currency-source",  "where a cafe's currency comes from, and that nothing is metered"],
  ["rates-dated",      "the rate for the day a drink was ordered"],
  ["rates-network",    "fetching a real rate, caching it, and every way it can fail"],
  ["wishlist-form",    "wishlist position and which fields it hides"],
  ["wishlist-save",    "wishlist drops the visit, and warns before deleting real history"],
  ["wishlist-drinks",  "a cafe with drinks logged comes off the wishlist"],
  ["cloud-writes",     "per-cafe writes, deletion, and the lost update they prevent"],
  ["private",          "a private spot never publishes an exact location or a street address"],
  ["keyboard",         "every control is reachable and activatable without a pointer"],
  ["locate",           "the locate button, its states, and the user dot it draws"],
  ["relocate",         "correcting a cafe location moves its area and its photo with it"],
  ["place-id",         "a cafe's photo is fetched by place id, not by searching its name"],
  ["offline",          "the app boots with the network pulled"],
  ["regression",       "101 real cafes still render exactly as before"]
];

let failed = [];
for (const [name, what] of SUITE) {
  process.stdout.write("── " + name + "  " + what + "\n");
  /* a test that hangs is a failing test — it must never wedge the run */
  const r = spawnSync(process.execPath, [path.join(__dirname, name + ".js")],
                      { stdio: "inherit", timeout: 120000 });
  if (r.signal === "SIGTERM") console.log("  TIMED OUT after 120s");
  if (r.status !== 0 || r.signal) failed.push(name);
  process.stdout.write("\n");
}

if (failed.length) {
  console.log("FAILED: " + failed.join(", "));
  process.exit(1);
}
console.log("suite green — " + SUITE.length + " files");
