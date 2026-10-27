#!/usr/bin/env node
"use strict";
/* Builds the site that gets published, into one folder (.github/workflows/deploy.yml uploads it to Pages):

     the app's own files       index.html, the scripts, the styles, icons — never tests/, notes, tooling or server.js
     cafes.json                the nightly backup from the `data` branch (--data), checked again before it goes out
     backup.json               when that backup was made, for Settings
     c/<id>.html              a share page per public cafe, made here from that cafes.json (scripts/share-pages.js)
     minified JS and CSS       comments and whitespace out, local names shortened, with a source map beside each file

   The source stays as written, every "why" in place; only the published copy is small. The classic scripts share one
   global scope and the page calls their functions by name (data-on="openDetail"), so they are minified without a
   module format: esbuild then leaves every top-level name alone and only shortens what is local. The output is
   held to ES2017, the newest syntax the source itself uses, so minifying never hands a phone syntax it lacks.

     node scripts/build-site.js [--data <folder with cafes.json>] [--out <folder>] [--no-minify]

   Without --data, or when that folder has no cafes.json yet (before the first nightly backup on the data branch),
   it publishes the cafes.json on main and says so. */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { execFileSync } = require("child_process");
const { build: sharePages } = require("./share-pages.js");

const ROOT = path.join(__dirname, "..");
/* The app. A file the app loads that is not here is missing from the live site, so tests/site-build.js checks this
   against every script, style and icon index.html, sw.js and manifest.json name. */
const APP = ["index.html", "404.html", "sw.js", "manifest.json", "styles.css", "icon-180.png", "icon-192.png", "icon-512.png", "js", "vendor"];
/* Already minified, or not ours to rewrite */
const KEEP_AS_IS = /^vendor\//;
const TARGET = "es2017";

/** Throws when the data is not safe to publish: the checks the nightly backup makes before it commits, made again
 *  here so a file that reached the data branch some other way still never goes live with a private address.
 *  The message names a private spot by its place in the list, never by anything about it. @param {any} cafes */
function checkData(cafes) {
  if (!Array.isArray(cafes) || !cafes.length) throw new Error("cafes.json is not a list of cafes");
  const coarse = v => v == null || Math.round(v * 100) / 100 === v;
  cafes.forEach((c, i) => {
    if (!c || c.custom !== true) return;
    const why = !coarse(c.lat) || !coarse(c.lng) ? "precise coordinates" : /[0-9]/.test(c.area || "") ? "a street address" : "pid" in c ? "a place id" : "";
    if (why) throw new Error("cafes.json: the private spot at position " + i + " carries " + why + "; not publishing");
  });
}

/** When the last commit touching `file` in the repo at `dir` was made; null outside git. @returns {Date|null} */
function commitTime(dir, file) {
  try {
    const t = execFileSync("git", ["-C", dir, "log", "-1", "--format=%ct", "--", file], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return t ? new Date(+t * 1000) : null;
  } catch (e) {
    return null;
  }
}

/** @param {string} file @returns {string[]} every file under it, relative to ROOT */
function walk(file) {
  const abs = path.join(ROOT, file);
  if (!fs.statSync(abs).isDirectory()) return [file];
  return fs.readdirSync(abs).flatMap(f => walk(path.join(file, f).split(path.sep).join("/")));
}

/** Minifies one file into `out`, with a linked source map. @returns {{ raw: number, min: number, gzRaw: number, gzMin: number }} */
function minifyFile(esbuild, rel, src, out) {
  const css = rel.endsWith(".css");
  const isModule = rel.startsWith("js/lib/");
  const r = esbuild.transformSync(src, {
    loader: css ? "css" : "js",
    minify: true,
    sourcemap: "external",
    sourcefile: path.basename(rel),
    legalComments: "none",
    /* CSS is not lowered for older browsers: the source is what the layout tests checked */
    ...(css ? {} : { target: TARGET }),
    ...(isModule ? { format: "esm" } : {}),
  });
  const map = path.basename(rel) + ".map";
  const code = r.code.replace(/\n$/, "") + (css ? "\n/*# sourceMappingURL=" + map + " */\n" : "\n//# sourceMappingURL=" + map + "\n");
  fs.writeFileSync(out, code);
  fs.writeFileSync(out + ".map", r.map);
  const gz = s => zlib.gzipSync(s, { level: 9 }).length;
  return { raw: Buffer.byteLength(src), min: Buffer.byteLength(code), gzRaw: gz(src), gzMin: gz(code) };
}

/** @param {{ data?: string, out?: string, minify?: boolean, log?: (s: string) => void }} [o] */
function buildSite(o) {
  o = o || {};
  const log = o.log || (s => console.log(s));
  const out = path.resolve(ROOT, o.out || "_site");
  /* it is about to be emptied: never the repo, nor anything that holds it */
  if (out === ROOT || ROOT.startsWith(out + path.sep) || out === path.parse(out).root) throw new Error("refusing to build into " + out);
  fs.rmSync(out, { recursive: true, force: true });

  let dataFile = path.join(ROOT, "cafes.json");
  if (o.data) {
    const want = path.resolve(ROOT, o.data, "cafes.json");
    if (fs.existsSync(want)) dataFile = want;
    else log((process.env.GITHUB_ACTIONS ? "::warning::" : "") + "no cafes.json in " + o.data + " (no nightly backup yet?): publishing the one on main");
  }
  const cafes = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  checkData(cafes);

  const esbuild = o.minify === false ? null : require("esbuild");
  const sizes = { raw: 0, min: 0, gzRaw: 0, gzMin: 0 };
  let files = 0;
  APP.flatMap(walk).forEach(rel => {
    const dest = path.join(out, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (esbuild && /\.(js|css)$/.test(rel) && !KEEP_AS_IS.test(rel)) {
      const s = minifyFile(esbuild, rel, fs.readFileSync(path.join(ROOT, rel), "utf8"), dest);
      Object.keys(sizes).forEach(k => (sizes[k] += s[k]));
    } else fs.copyFileSync(path.join(ROOT, rel), dest);
    files++;
  });
  fs.writeFileSync(path.join(out, "cafes.json"), fs.readFileSync(dataFile));
  /* Settings says when the newest backup copy was made. It read that from cafes.json's Last-Modified until v110,
     but Pages stamps every file of a deployment with the deployment's time, and a deploy now follows every code push
     as well as every backup. So the date travels in a file of its own: when the commit on the data branch that holds
     this cafes.json was made. Built from main's copy (no data branch yet, or a local build) there is no such date to
     give, so there is no file, and Settings says what the backup is rather than when. */
  const fromData = dataFile !== path.join(ROOT, "cafes.json");
  const when = fromData ? commitTime(path.dirname(dataFile), "cafes.json") : null;
  if (when) fs.writeFileSync(path.join(out, "backup.json"), JSON.stringify({ at: when.toISOString() }) + "\n");
  const pages = sharePages(cafes, path.join(out, "c"));

  const kb = n => (n / 1024).toFixed(0) + " KB";
  log("site: " + files + " app files, " + cafes.length + " cafes" + (fromData ? " (" + path.relative(ROOT, dataFile) + (when ? ", backed up " + when.toISOString() : "") + ")" : " (main's cafes.json)") + ", " + pages + " share pages -> " + path.relative(ROOT, out));
  if (esbuild) log("minified JS and CSS: " + kb(sizes.raw) + " -> " + kb(sizes.min) + ", compressed " + kb(sizes.gzRaw) + " -> " + kb(sizes.gzMin));
  return { out, files, cafes: cafes.length, pages, sizes, backupAt: when ? when.toISOString() : null };
}

module.exports = { buildSite, checkData, APP };

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = name => (args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : undefined);
  try {
    buildSite({ data: opt("--data"), out: opt("--out"), minify: args.indexOf("--no-minify") < 0 });
  } catch (e) {
    console.error(String(e && e.message ? e.message : e));
    process.exit(1);
  }
}
