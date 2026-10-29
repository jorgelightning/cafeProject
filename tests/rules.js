/* The database rules (database.rules.json), which until 27 Oct lived only as a block of text in README.md and a
   comment in js/config.js, pasted by hand into the Firebase console. Now they are a file, deployed with
   `npx firebase-tools deploy --only database`, and tested here.

   Two halves:
   - always: the file says what the app needs — the owner is OWNER_EMAIL from config.js, and the copies in README.md
     and config.js still say the same thing (they are what someone setting up a fork reads);
   - against the Firebase database emulator, when one is running: the rules are put to the questions that matter.
     Anyone reads the map; only the owner, with a verified address, writes it; nobody else reads or writes private
     spots; nothing outside the two nodes can be written at all.

   The second half runs with `npm run test:rules`, which starts the emulator (it needs Java) and this file inside it;
   CI does that on every push. Passing --emulator makes a missing emulator a failure rather than a skip. The emulator
   runs as a demo- project, so it can never reach the real database. */
const { checker, ROOT } = require("./harness");
const { eq, done } = checker();
const fs = require("fs"), path = require("path");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

const rules = JSON.parse(read("database.rules.json"));
const OWNER = /const OWNER_EMAIL = "([^"]+)"/.exec(read("js/config.js"))[1];
const ownerRule = "auth != null && auth.token.email_verified == true && auth.token.email == '" + OWNER + "'";
eq(rules, { rules: { cafes: { ".read": true, ".write": ownerRule }, private: { ".read": ownerRule, ".write": ownerRule } } },
   "the map is public to read; it and the private spots are the owner's (OWNER_EMAIL) to write; nothing else is granted");
/* the setup notes a fork follows: same rule, with the address as a placeholder in the README */
const same = s => s.replace(/'[^']*@[^']*'|'YOUR_OWNER_EMAIL'/g, "'X'").replace(/\s+/g, " ");
const block = s => (/"rules":\s*\{[\s\S]*?"private":\s*\{[\s\S]*?\}\s*\}/.exec(s) || [""])[0];
eq(same(block(read("README.md"))), same(block(JSON.stringify(rules, null, 2))), "README.md's copy of the rules says the same");
eq(same(block(read("js/config.js"))).replace(/ /g, ""), same(block(JSON.stringify(rules))).replace(/ /g, ""), "…and so does config.js's");
/* reader tips (v120) live in Firestore, under their own rule */
const fsRules = read("firestore.rules");
eq((fsRules.match(/request\.auth\.token\.email == '([^']+)'/) || [])[1], OWNER, "firestore.rules names the same owner (OWNER_EMAIL)");
eq(JSON.parse(read("firebase.json")).firestore, { rules: "firestore.rules" }, "…and firebase.json deploys it");

const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const NS = "demo-cafemap-default-rtdb";
if (!HOST) {
  if (process.argv.includes("--emulator")) { eq("no emulator", "an emulator", "FIREBASE_DATABASE_EMULATOR_HOST is set (run through npm run test:rules)"); }
  else console.log("  (the emulator half runs under npm run test:rules)");
  process.exit(done() ? 0 : 1);
}

/* An ID token as Firebase Auth would issue it, unsigned: the emulator reads the claims and does not check the
   signature, which is exactly what is needed to ask "what if this person, with this address, tried that?" */
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
function token(email, verified) {
  const now = Math.floor(Date.now() / 1000);
  return b64({ alg: "none", typ: "JWT" }) + "." + b64({
    iss: "https://securetoken.google.com/demo-cafemap", aud: "demo-cafemap", auth_time: now, iat: now, exp: now + 3600,
    sub: "u-" + email.replace(/\W/g, ""), user_id: "u-" + email.replace(/\W/g, ""), email, email_verified: verified,
    firebase: { identities: { email: [email] }, sign_in_provider: "google.com" },
  }) + ".";
}
const WHO = {
  anyone: null,
  owner: token(OWNER, true),
  unverified: token(OWNER, false),
  stranger: token("someone.else@example.com", true),
};
async function ask(who, method, p, body) {
  const url = "http://" + HOST + "/" + p + ".json?ns=" + NS + (WHO[who] ? "&auth=" + WHO[who] : "");
  const r = await fetch(url, who === "admin" ? { method, body: JSON.stringify(body), headers: { Authorization: "Bearer owner" } }
                                              : { method, body: body === undefined ? undefined : JSON.stringify(body) });
  return r.ok ? "ok" : r.status === 401 || r.status === 403 ? "denied" : "HTTP " + r.status;
}

(async () => {
  /* the emulator starts empty, with the rules from firebase.json; seed past them */
  const put = await fetch("http://" + HOST + "/.json?ns=" + NS, { method: "PUT", headers: { Authorization: "Bearer owner" },
    body: JSON.stringify({ cafes: { c1: { id: "c1", name: "Morning Glass" } }, private: { p1: { lat: 37.1234, lng: -122.5678 } } }) });
  eq(put.ok, true, "the emulator is up and seeded");

  const grid = {};
  for (const who of ["anyone", "stranger", "unverified", "owner"]) {
    grid[who] = {
      readMap: await ask(who, "GET", "cafes"),
      writeMap: await ask(who, "PUT", "cafes/c2", { id: "c2", name: "New" }),
      deleteMap: await ask(who, "DELETE", "cafes/c1"),
      readPrivate: await ask(who, "GET", "private"),
      writePrivate: await ask(who, "PUT", "private/p2", { lat: 1, lng: 2 }),
      elsewhere: await ask(who, "PUT", "__rulesprobe", true),
    };
    /* put back what an allowed delete took, so the next person meets the same database */
    await fetch("http://" + HOST + "/cafes/c1.json?ns=" + NS, { method: "PUT", headers: { Authorization: "Bearer owner" }, body: JSON.stringify({ id: "c1", name: "Morning Glass" }) });
  }
  const D = "denied";
  eq(grid.anyone, { readMap: "ok", writeMap: D, deleteMap: D, readPrivate: D, writePrivate: D, elsewhere: D },
     "a visitor reads the map, and nothing else: no edits, no deletes, no private spots");
  eq(grid.stranger, { readMap: "ok", writeMap: D, deleteMap: D, readPrivate: D, writePrivate: D, elsewhere: D },
     "someone else signed in with Google is a visitor too");
  eq(grid.unverified, { readMap: "ok", writeMap: D, deleteMap: D, readPrivate: D, writePrivate: D, elsewhere: D },
     "the owner's address without a verified email is refused (an account can claim an address it does not own)");
  eq(grid.owner, { readMap: "ok", writeMap: "ok", deleteMap: "ok", readPrivate: "ok", writePrivate: "ok", elsewhere: D },
     "the owner reads and writes both, and still cannot write outside them");

  /* the app's own rule probe (storage.js) asks as a stranger: deleting a key that is not there must be refused */
  eq(await ask("anyone", "DELETE", "cafes/__rulesprobe"), D, "the rule probe's question gets the answer the app hopes for");

  /* ---- reader tips, in Firestore (v120) ---- */
  const FS = process.env.FIRESTORE_EMULATOR_HOST;
  if (!FS) eq("no Firestore emulator", "a Firestore emulator", "FIRESTORE_EMULATOR_HOST is set (npm run test:rules starts both)");
  else {
    const base = "http://" + FS + "/v1/projects/demo-cafemap/databases/(default)/documents";
    const str = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { stringValue: v }]));
    const good = { place: "Sightglass Coffee", where: "SoMa", order: "Their seasonal latte", from: "Sam", via: "go" };
    let n = 0;
    /* a tip as the app sends one: its fields, and the server's time as `at` */
    async function tip(who, fields, stamp) {
      const name = "projects/demo-cafemap/databases/(default)/documents/tips/t" + ++n;
      const w = { update: { name, fields: str(fields) }, currentDocument: { exists: false } };
      if (stamp === "now") w.updateTransforms = [{ fieldPath: "at", setToServerValue: "REQUEST_TIME" }];
      else if (stamp) w.update.fields.at = { timestampValue: stamp };
      const r = await fetch(base + ":commit", { method: "POST", headers: WHO[who] ? { Authorization: "Bearer " + WHO[who] } : {},
        body: JSON.stringify({ writes: [w] }) });
      return { id: "t" + n, said: r.ok ? "ok" : r.status === 403 ? "denied" : "HTTP " + r.status };
    }
    async function on(who, method, p, body) {
      const r = await fetch(base + p, { method, headers: WHO[who] ? { Authorization: "Bearer " + WHO[who] } : {}, body: body && JSON.stringify(body) });
      return r.ok ? "ok" : r.status === 403 ? "denied" : "HTTP " + r.status;
    }
    const sent = await tip("anyone", good, "now");
    eq(sent.said, "ok", "a visitor, signed out, can send a tip");
    eq((await tip("stranger", good, "now")).said, "ok", "…and so can someone signed in");
    eq((await tip("anyone", Object.assign({}, good, { where: "", order: "", from: "" }), "now")).said, "ok", "…with only the place filled in");
    const refused = {
      noPlace: (await tip("anyone", Object.assign({}, good, { place: "" }), "now")).said,
      longPlace: (await tip("anyone", Object.assign({}, good, { place: "x".repeat(81) }), "now")).said,
      longOrder: (await tip("anyone", Object.assign({}, good, { order: "x".repeat(201) }), "now")).said,
      longName: (await tip("anyone", Object.assign({}, good, { from: "x".repeat(41) }), "now")).said,
      otherVia: (await tip("anyone", Object.assign({}, good, { via: "admin" }), "now")).said,
      extraField: (await tip("anyone", Object.assign({}, good, { lat: "37.7" }), "now")).said,
      missingField: (await tip("anyone", { place: "A", where: "", order: "", via: "go" }, "now")).said,
      backDated: (await tip("anyone", good, "2020-01-01T00:00:00Z")).said,
    };
    eq(refused, { noPlace: D, longPlace: D, longOrder: D, longName: D, otherVia: D, extraField: D, missingField: D, backDated: D },
       "a tip is refused without a place, past any length limit, from anywhere but Go or search, with a field of its own, a field missing, or a date of its own");
    const doc = "/tips/" + sent.id;
    eq({ anyone: await on("anyone", "GET", doc), stranger: await on("stranger", "GET", doc), unverified: await on("unverified", "GET", doc),
         list: await on("anyone", "GET", "/tips"), owner: await on("owner", "GET", doc), ownerList: await on("owner", "GET", "/tips") },
       { anyone: D, stranger: D, unverified: D, list: D, owner: "ok", ownerList: "ok" },
       "only the owner, with a verified address, can read a tip or list them");
    eq(await on("owner", "PATCH", doc + "?updateMask.fieldPaths=order", { fields: str({ order: "changed" }) }), D, "nobody changes a tip, not even the owner");
    eq([await on("anyone", "DELETE", doc), await on("stranger", "DELETE", doc), await on("owner", "DELETE", doc)], [D, D, "ok"], "only the owner deletes one");
    eq(await on("anyone", "PATCH", "/elsewhere/x", { fields: str({ a: "b" }) }), D, "nothing outside tips can be written");
  }

  process.exit(done() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
