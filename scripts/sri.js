/* The integrity hashes for the scripts the page loads from gstatic (engineering audit, 27 Oct).

   index.html pins the Firebase app and database scripts by hash, and js/config.js pins the sign-in script
   (FIREBASE_AUTH_SRI), so a file that changed on gstatic is refused instead of run. Moving to a new Firebase version
   means new hashes: change the version in the three URLs, then

     node scripts/sri.js            fetch the three files and write their hashes into index.html and config.js
     node scripts/sri.js --check    fetch them and only say whether the pinned hashes still match

   Needs the network. tests/csp.js checks that every external script carries a hash; this checks the hash is right. */
const fs = require("fs"),
  path = require("path"),
  crypto = require("crypto");
const ROOT = path.join(__dirname, "..");
const HTML = path.join(ROOT, "index.html"),
  CFG = path.join(ROOT, "js", "config.js");

const sri = buf => "sha384-" + crypto.createHash("sha384").update(buf).digest("base64");
async function fetchBuf(u) {
  const r = await fetch(u);
  if (!r.ok) throw new Error(u + " answered " + r.status);
  return Buffer.from(await r.arrayBuffer());
}

(async () => {
  const check = process.argv.includes("--check");
  let html = fs.readFileSync(HTML, "utf8"),
    cfg = fs.readFileSync(CFG, "utf8");
  /* each pinned script: where its URL and hash live, and how to put a new hash there */
  const tags = [...html.matchAll(/<script src="(https:\/\/www\.gstatic\.com\/[^"]+)"[^>]*>/g)].map(m => ({
    where: "index.html",
    url: m[1],
    have: (/integrity="([^"]*)"/.exec(m[0]) || [])[1] || "",
    put: h => (html = html.replace(m[0], m[0].replace(/ integrity="[^"]*"/, "").replace(/ crossorigin="[^"]*"/, "").replace(/>$/, ' integrity="' + h + '" crossorigin="anonymous">'))),
  }));
  const authUrl = (/const FIREBASE_AUTH_SRC = "([^"]+)";/.exec(cfg) || [])[1];
  if (authUrl)
    tags.push({
      where: "config.js FIREBASE_AUTH_SRI",
      url: authUrl,
      have: (/const FIREBASE_AUTH_SRI = "([^"]*)";/.exec(cfg) || [])[1] || "",
      put: h => (cfg = cfg.replace(/const FIREBASE_AUTH_SRI = "[^"]*";/, 'const FIREBASE_AUTH_SRI = "' + h + '";')),
    });
  if (!tags.length) throw new Error("no gstatic scripts found in index.html");

  let stale = 0;
  for (const t of tags) {
    const want = sri(await fetchBuf(t.url));
    const ok = t.have === want;
    if (!ok) stale++;
    console.log((ok ? "ok     " : check ? "STALE  " : "update ") + path.basename(t.url) + "  (" + t.where + ")" + (ok ? "" : "\n       " + want));
    if (!ok && !check) t.put(want);
  }
  if (check) process.exit(stale ? 1 : 0);
  if (stale) {
    fs.writeFileSync(HTML, html);
    fs.writeFileSync(CFG, cfg);
    console.log("wrote " + stale + " hash(es). Bump the version (npm run bump) so devices fetch the new page.");
  } else console.log("all hashes already match");
})().catch(e => {
  console.error(e.message || e);
  process.exit(1);
});
