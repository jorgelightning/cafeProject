/* Reader tips (v120).

   A visitor can tell the owner about a place, from the end of Go or from a search that found nothing, and only the
   owner can read what they send (Settings, Tips from readers), turn one into a want-to-try, or dismiss it. Tips live
   in Firestore behind App Check; firestore.rules is put to the emulator by tests/rules.js. Here config.js is served
   with a stand-in reCAPTCHA key so tips are on, and the one function that talks to Firestore (tipStore) is replaced
   by a fake that records what it was asked, so nothing reaches Google. */
const { serve, launch, checker, ready, ROOT } = require("./harness");
const { eq, done } = checker();
const fs = require("fs"), path = require("path");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

(async () => {
  const srv = await serve();
  const b = await launch();

  /* ---- with no key, tips are off: nothing asks for one ---- */
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const pg = await ctx.newPage();
    await pg.route("**://**", r => (r.request().url().startsWith(srv.origin) ? r.continue() : r.abort()));
    await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
    await ready(pg);
    const off = await pg.evaluate(() => {
      isAdmin = false; applyMode(); show("compare"); renderBoard();
      const go = !!document.querySelector(".tipask");
      $("q").value = "Sightglass"; show("list"); renderList();
      const search = [...document.querySelectorAll("#grid button")].some(x => /^Tell /.test(x.textContent));
      isAdmin = true; applyMode();
      return { on: tipsOn(), go, search, card: getComputedStyle($("card-tips")).display };
    });
    eq(off, { on: false, go: false, search: false, card: "none" }, "with no RECAPTCHA_SITE_KEY, tips are off: no row on Go, nothing on a search, no card in Settings");
    await ctx.close();
  }

  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => (r.request().url().startsWith(srv.origin) ? r.continue() : r.abort()));
  await pg.route(/\/js\/config\.js/, r =>
    r.fulfill({ contentType: "text/javascript", body: read("js/config.js").replace(/const RECAPTCHA_SITE_KEY = "[^"]*";/, 'const RECAPTCHA_SITE_KEY = "test-site-key";') }));
  const errs = [];
  pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await ready(pg);

  await pg.evaluate(() => {
    const y = new Date().getFullYear();
    window._fake = { added: [], removed: [], fail: { add: false, list: false },
      tips: [
        { id: "t1", place: "Sightglass Coffee", where: "SoMa", order: "Their seasonal latte", from: "Sam", via: "go", at: new Date(y, 0, 15, 10) },
        { id: "t2", place: "Kamari Coffee", where: "", order: "", from: "", via: "search", at: new Date(y, 0, 14, 10) },
        { id: "t3", place: "Saint Frank", where: "Russian Hill", order: "", from: "", via: "go", at: new Date(y, 0, 13, 10) },
      ] };
    const F = window._fake;
    tipStore = () => Promise.resolve({
      add: t => (F.fail.add ? Promise.reject(new Error("offline")) : (F.added.push(t), Promise.resolve())),
      list: () => (F.fail.list ? Promise.reject(new Error("denied")) : Promise.resolve(F.tips.filter(t => !F.removed.includes(t.id)))),
      remove: id => (F.removed.push(id), Promise.resolve()),
    });
    cafes = [
      { id: "kh", name: "Kissaten HiFi", area: "San Francisco, CA", lat: 37.78, lng: -122.46, rating: 5, matches: 6, elo: 1600,
        drinks: [{ n: "Flat White", orders: [{ id: "f1", date: "2026-10-01", p: "5" }] }] },
      { id: "km", name: "Kamari Coffee", area: "Financial District", lat: 37.79, lng: -122.4, wish: true, drinks: [] },
    ];
    privDetail = {};
    isAdmin = false;
    applyMode();
    show("compare");
    renderBoard();
  });

  /* ---- a visitor, at the end of Go ---- */
  const ask = pg.locator(".tipask");
  eq(await ask.count(), 1, "Go ends with Know a place Jorge should try? for a visitor");
  eq(await pg.evaluate(() => { const b = document.querySelector("#cmp-body .boardwrap"); return b.lastElementChild.previousElementSibling.classList.contains("tipask"); }), true,
     "…after the list, just above the numbers link");
  await ask.click();
  let s = await pg.evaluate(() => ({ title: $("dns-title").textContent, send: $("tip-send").disabled, focus: document.activeElement.id,
    legal: document.querySelector(".tiplegal").textContent }));
  eq([s.title, s.send, s.focus], ["Know a place Jorge should try?", true, "tip-place"], "the sheet opens on the place, and Send waits for one");
  eq(/reCAPTCHA/.test(s.legal) && /Privacy Policy/.test(s.legal), true, "…and says reCAPTCHA protects it, with Google's links, since its badge is hidden");
  await pg.locator("#tip-place").fill("  Sightglass   Coffee ");
  eq(await pg.evaluate(() => $("tip-send").disabled), false, "a place turns Send on");
  await pg.locator("#tip-where").fill("SoMa");
  await pg.locator("#tip-order").evaluate(el => { el.removeAttribute("maxlength"); el.value = "x".repeat(250); });
  await pg.locator("#tip-from").fill("Sam");
  await pg.getByRole("button", { name: "Send to Jorge" }).click();
  await pg.waitForFunction(() => $("dns-title").textContent !== "Know a place Jorge should try?");
  s = await pg.evaluate(() => ({ added: window._fake.added, title: $("dns-title").textContent, focus: document.activeElement.textContent }));
  eq(s.added.length, 1, "Send sends one tip");
  eq(Object.assign({}, s.added[0], { order: s.added[0].order.length }), { place: "Sightglass Coffee", where: "SoMa", order: 200, from: "Sam", via: "go" },
     "…trimmed, its spaces folded, each field cut to the rule's limit, and from Go");
  eq([s.title, s.focus], ["Sent. Thank you!", "Done"], "…and the sheet says it went, with the keyboard on Done");
  await pg.keyboard.press("Enter");

  /* a send that fails says so and can be tried again */
  await pg.evaluate(() => { window._fake.fail.add = true; openTipSheet("Ritual", "go"); });
  await pg.getByRole("button", { name: "Send to Jorge" }).click();
  await pg.waitForFunction(() => $("tip-msg").textContent !== "");
  s = await pg.evaluate(() => ({ msg: $("tip-msg").textContent, send: $("tip-send").disabled, label: $("tip-send").textContent, title: $("dns-title").textContent }));
  eq(s, { msg: "Couldn’t send it. Check your connection and try again.", send: false, label: "Send to Jorge", title: "Know a place Jorge should try?" },
     "a failed send keeps the tip on screen, says why, and offers Send again");
  await pg.evaluate(() => { window._fake.fail.add = false; closeSheet(); });

  /* ---- a search that found nothing ---- */
  await pg.evaluate(() => { show("list"); $("q").value = "Sightglass"; renderList(); });
  const tell = pg.getByRole("button", { name: "Tell Jorge about “Sightglass”" });
  eq(await tell.count(), 1, "a visitor's search that finds nothing offers to tell Jorge about it");
  await tell.click();
  s = await pg.evaluate(() => ({ place: $("tip-place").value, send: $("tip-send").disabled }));
  eq(s, { place: "Sightglass", send: false }, "…with the search as the place, ready to send");
  await pg.getByRole("button", { name: "Send to Jorge" }).click();
  await pg.waitForFunction(() => window._fake.added.length === 2);
  eq(await pg.evaluate(() => window._fake.added[1].via), "search", "…and the tip says it came from a search");
  await pg.evaluate(() => closeSheet());

  /* ---- the owner ---- */
  s = await pg.evaluate(() => {
    isAdmin = true; applyMode(); show("compare"); renderBoard();
    const go = !!document.querySelector(".tipask");
    openTipSheet("x", "go");
    return { go, sheet: !$("dnsheet").hidden, card: getComputedStyle($("card-tips")).display };
  });
  eq(s, { go: false, sheet: false, card: "flex" }, "the owner gets no tip row and no tip sheet, and a Tips card in Settings");
  await pg.evaluate(() => show("settings"));
  await pg.getByRole("button", { name: "Open tips" }).click();
  await pg.waitForSelector('#dns-panel .tipbox[data-k="inbox"] .tipitem');
  s = await pg.evaluate(() => [...document.querySelectorAll(".tipitem")].map(x => ({
    place: x.querySelector("b").textContent,
    line: x.querySelector("small").textContent,
    acts: [...x.querySelectorAll(".tipacts button, .tiphave")].map(b => b.textContent.trim()),
  })));
  eq(s.map(x => x.place), ["Sightglass Coffee", "Kamari Coffee", "Saint Frank"], "the inbox lists the tips, newest first");
  eq(s[0].line, "From Sam · Jan 15 · via Go", "…each with who, when, and where it was sent from");
  eq(s[1].acts, ["On your want-to-try", "Dismiss"], "a tip for a place already on your list says so, and only offers Dismiss");
  eq(s[2].acts, ["Want to try", "Dismiss"], "…a new one offers Want to try");
  eq(s[2].line, "No name · Jan 13 · via Go", "…and a tip with no name says so");

  await pg.locator(".tipitem").filter({ hasText: "Saint Frank" }).getByRole("button", { name: "Dismiss" }).click();
  await pg.waitForFunction(() => document.querySelectorAll(".tipitem").length === 2);
  eq(await pg.evaluate(() => window._fake.removed), ["t3"], "Dismiss deletes that tip, and the inbox redraws without it");

  await pg.locator(".tipitem").filter({ hasText: "Sightglass" }).getByRole("button", { name: "Want to try" }).click();
  s = await pg.evaluate(() => ({
    view: app.dataset.view, name: $("f-name").value, wish: $("f-wish").checked, notes: $("f-review").value,
    label: $("f-review-label").textContent, removed: window._fake.removed.length,
  }));
  eq(s, { view: "form", name: "Sightglass Coffee", wish: true, notes: "Tip from Sam, Jan 15: Their seasonal latte · SoMa", label: "Notes", removed: 1 },
     "Want to try opens the new-place form with the name, want-to-try ticked, and the tip as its notes; the tip stays until dismissed");

  /* an inbox that cannot load says so (the form holds the tip unsaved, and leaving it would ask first: take it as is) */
  await pg.evaluate(() => { _formSnap = formSnapshot(); window._fake.fail.list = true; show("settings"); });
  await pg.getByRole("button", { name: "Open tips" }).click();
  await pg.waitForFunction(() => !/Loading/.test(document.querySelector("#dns-panel .tipmsg").textContent));
  eq(await pg.evaluate(() => document.querySelector("#dns-panel .tipmsg").textContent), "Tips couldn’t load. Check your connection and try again.", "an inbox that cannot load says so");
  await pg.evaluate(() => closeSheet());

  /* ---- the pure part ---- */
  s = await pg.evaluate(() => [cleanTip({ place: "   " }, "go"), cleanTip({ place: "A", where: null }, "admin"), cleanTip({ place: "A\n\tB" }, "search")]);
  eq(s, [null, { place: "A", where: "", order: "", from: "", via: "go" }, { place: "A B", where: "", order: "", from: "", via: "search" }],
     "cleanTip: nothing without a place, every field present, only go or search");

  eq(errs, [], "no page errors");
  await ctx.close();
  await b.close();
  srv.close();
  process.exit(done() ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
