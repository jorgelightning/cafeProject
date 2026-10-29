/* The Content Security Policy (index.html) and the integrity hashes on the scripts from gstatic.

   The policy only means something while the page has no inline script, so this holds both sides: the markup and the
   scripts keep to it (no inline <script>, no on*= handler, no eval), and the policy keeps naming every host the code
   talks to. A new host in the code without a line in the policy fails here, not in a visitor's browser. Then the
   app is walked through its screens under the policy, and anything the browser refuses is a failure.

   That the policy lets the real Maps, database and sign-in through is tests/csp-live.js, which needs the network. */
const { serve, launch, checker, ready, ROOT } = require("./harness");
const { eq, done } = checker();
const fs = require("fs"), path = require("path");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

const html = read("index.html");
const bare = html.replace(/<!--[\s\S]*?-->/g, "");
const metas = bare.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/g) || [];
eq(metas.length, 1, "index.html carries one policy");
const policy = metas.length ? /content="([^"]*)"/.exec(metas[0])[1] : "";
const dir = {};
policy.split(";").map(s => s.trim()).filter(Boolean).forEach(s => { const [k, ...v] = s.split(/\s+/); dir[k] = v; });
eq(bare.indexOf("Content-Security-Policy") < bare.indexOf("<script"), true, "…ahead of every script, or the ones before it are not covered");
eq(["'unsafe-inline'", "'unsafe-eval'", "*", "https:"].filter(x => (dir["script-src"] || []).includes(x)), [],
   "script-src allows no inline script, no eval and no wildcard host");
eq([dir["object-src"], dir["base-uri"]], [["'none'"], ["'self'"]], "no plugins, and no <base> that could move every relative URL");

/* the page keeps to it */
const inline = [...bare.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)].map(m => m[0]);
eq(inline, [], "no inline <script> in index.html");
eq((bare.match(/\son[a-z]+=["']/g) || []), [], "no on*= handler in index.html");
const js = fs.readdirSync(path.join(ROOT, "js"), { recursive: true }).filter(f => f.endsWith(".js"))
  .map(f => [f, read(path.join("js", f))]);
eq(js.filter(([, s]) => /\son[a-z]+=\\?["']/.test(s)).map(([f]) => f), [], "no script writes an on*= handler into markup (core.js act() instead)");
eq(js.filter(([, s]) => /\beval\(|new Function\(|setTimeout\(\s*["'`]|javascript:/.test(s)).map(([f]) => f), [],
   "no eval, new Function, string timer or javascript: URL");

/* and names every host the code talks to */
const cfg = read("js/config.js");
const allows = (d, origin) => (dir[d] || []).some(src => {
  if (src === origin) return true;
  const m = /^(https|wss):\/\/\*\.(.+)$/.exec(src);
  return !!m && origin.startsWith(m[1] + "://") && origin.endsWith("." + m[2]);
});
const host = u => { const x = new URL(u); return x.protocol + "//" + x.host; };
const dbURL = /databaseURL:\s*"([^"]+)"/.exec(cfg)[1];
const fx = /const FX_API = "([^"]*)"/.exec(cfg)[1];
const authDomain = /authDomain:\s*"([^"]+)"/.exec(cfg)[1];
const authSrc = /const FIREBASE_AUTH_SRC = "([^"]+)"/.exec(cfg)[1];
eq(allows("connect-src", host(dbURL)) && allows("connect-src", host(dbURL).replace("https:", "wss:")), true,
   "the database, over https and its WebSocket");
eq(allows("script-src", host(dbURL)) && allows("frame-src", host(dbURL)), true, "…and its long-polling fallback (scripts and a frame)");
eq(!fx || allows("connect-src", host(fx)), true, "the exchange rates (FX_API)");
eq(allows("frame-src", "https://" + authDomain), true, "Google sign-in's frame (authDomain)");
eq(allows("script-src", host(authSrc)), true, "the sign-in script's host");
eq(/maps\.googleapis\.com\/maps\/api\/js/.test(read("js/map.js")) && allows("script-src", "https://maps.googleapis.com"), true, "Google Maps");

/* integrity on everything from another host */
const ext = [...bare.matchAll(/<script[^>]*\bsrc="(https?:[^"]+)"[^>]*>/g)].map(m => m[0]);
eq(ext.length >= 2, true, "the Firebase scripts are found");
eq(ext.filter(t => !/\bintegrity="sha384-[A-Za-z0-9+/=]{64}"/.test(t) || !/\bcrossorigin="anonymous"/.test(t)), [],
   "every script from another host is pinned by hash, and asked for without credentials");
eq(/const FIREBASE_AUTH_SRI = "sha384-[A-Za-z0-9+/=]{64}";/.test(cfg), true, "the sign-in script has its hash too (config.js)");
eq(/s\.integrity = FIREBASE_AUTH_SRI;/.test(read("js/storage.js")) && /s\.crossOrigin = "anonymous";/.test(read("js/storage.js")), true,
   "…and ensureAuth() sets it on the script it adds");
eq(new Set([...bare.matchAll(/firebasejs\/([\d.]+)\//g)].map(m => m[1]).concat([...cfg.matchAll(/const FIREBASE_\w+_SRC = "[^"]*firebasejs\/([\d.]+)\//g)].map(m => m[1]))).size, 1,
   "every Firebase script, in the page and loaded on demand, is one version, so their hashes are from one release");
/* reader tips (v120): App Check and Firestore load on demand, pinned like sign-in, and reCAPTCHA gets its script and frame */
eq(["APPCHECK", "FIRESTORE"].filter(k => !new RegExp('const FIREBASE_' + k + '_SRI = "sha384-[A-Za-z0-9+/=]{64}";').test(cfg)), [],
   "App Check and Firestore, loaded for reader tips, have their hashes too (config.js)");
eq(/s\.integrity = sri;/.test(read("js/tips.js")) && /s\.crossOrigin = "anonymous";/.test(read("js/tips.js")), true,
   "…and tips.js sets the hash on each script it adds");
eq([(dir["script-src"] || []).includes("https://www.google.com/recaptcha/"), (dir["frame-src"] || []).includes("https://www.google.com/recaptcha/"),
    [...(dir["script-src"] || []), ...(dir["frame-src"] || [])].filter(x => /www\.google\.com/.test(x) && x !== "https://www.google.com/recaptcha/")],
   [true, true, []], "reCAPTCHA's script and frame are allowed for App Check, and nothing else on www.google.com");

/* the app, walked under the policy */
(async () => {
  const srv = await serve();
  const b = await launch();
  const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  await pg.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.violatedDirective + " " + (e.blockedURI || "inline") + " @" + (e.sourceFile || "") + ":" + e.lineNumber));
  });
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await ready(pg);
  const r = await pg.evaluate(async () => {
    const tick = () => new Promise(r => setTimeout(r, 120));
    cafes = await (await fetch("cafes.json")).json();
    const one = cafes.find(c => !c.wish && c.drinks && c.drinks.length) || cafes[0];
    const walked = [];
    for (const admin of [false, true]) {
      isAdmin = admin; applyMode();
      for (const v of ["list", "map", "compare", "stats", "settings"]) { show(v); await tick(); walked.push(v); }
      openDetail(one.id, "list"); await tick(); walked.push("detail");
      /* a control fires through the delegated listener, which is how every button works now */
      const more = document.querySelector('#pane-detail [data-on]'); if (more) more.click(); await tick();
      if (admin) { editId = null; _formSnap = null; openForm(); await tick(); walked.push("form"); }
      show("list"); await tick();
    }
    return { walked: walked.length, theme: typeof document.documentElement.dataset.theme !== "undefined" || true };
  });
  eq(r.walked >= 12, true, "every screen, as a visitor and as the owner (" + r.walked + " stops)");
  eq(await pg.evaluate(() => window.__csp), [], "nothing on any of them refused by the policy");
  eq(errs, [], "no page errors");
  const ok = done();
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
