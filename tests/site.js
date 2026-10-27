/* The whole suite against the site as it is published: scripts/build-site.js builds it, minified, into _site_test,
   and every test's browser is served that instead of the source (SERVE_ROOT in tests/harness.js); tests still read
   the source from the repo. The deploy runs this before it publishes. `npm run test:site`. */
"use strict";
const { spawnSync } = require("child_process");
const path = require("path");
const { buildSite } = require("../scripts/build-site.js");

buildSite({ out: "_site_test" });
const r = spawnSync(process.execPath, [path.join(__dirname, "run.js")], { stdio: "inherit", env: { ...process.env, SERVE_ROOT: "_site_test" } });
process.exit(r.status === null ? 1 : r.status);
