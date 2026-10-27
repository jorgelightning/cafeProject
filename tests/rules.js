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

  process.exit(done() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
