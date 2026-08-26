/* Shared plumbing for the test suite.
   Every test needs the same two things: the app served over http (file:// breaks
   localStorage and service workers) and a browser pointed at it. Ports are assigned by the
   OS so tests can run in parallel and never collide. */
"use strict";
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json"
};

/* Serves the repo. Returns { origin, close } — origin is the http://127.0.0.1:PORT the
   browser should load, with the port the OS handed us. */
function serve() {
  const srv = http.createServer((rq, rs) => {
    const rel = decodeURIComponent(rq.url.split("?")[0]);
    let file = path.join(ROOT, rel);
    if (file.endsWith("/")) file += "index.html";
    /* never serve outside the repo, however creative the request is */
    if (!file.startsWith(ROOT)) { rs.writeHead(403); rs.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { rs.writeHead(404); rs.end(); return; }
      rs.writeHead(200, {
        "Content-Type": MIME[path.extname(file)] || "text/plain",
        "Cache-Control": "no-cache"
      });
      rs.end(data);
    });
  });
  return new Promise(resolve => {
    srv.listen(0, "127.0.0.1", () => {
      resolve({
        /* localhost, not 127.0.0.1: both are secure contexts, but the service worker
           registration in boot.js keys on the hostname. */
        origin: "http://localhost:" + srv.address().port,
        close: () => srv.close()
      });
    });
  });
}

/* Uses whatever Chromium `npx playwright install chromium` put on this machine. */
function launch() {
  return chromium.launch();
}

/* Keeps a tally and prints one line per failure with both sides, so a red run says what
   broke without needing a debugger. */
function checker() {
  let pass = 0, fail = 0;
  const eq = (got, want, label) => {
    const a = JSON.stringify(got), b = JSON.stringify(want);
    if (a === b) { pass++; return; }
    fail++;
    console.log("  FAIL " + label + "\n    got  " + a + "\n    want " + b);
  };
  const done = () => {
    console.log((fail ? "" : "all ") + pass + " passed" + (fail ? ", " + fail + " FAILED" : ""));
    return fail === 0;
  };
  return { eq, done, counts: () => ({ pass, fail }) };
}

module.exports = { ROOT, serve, launch, checker, chromium };
