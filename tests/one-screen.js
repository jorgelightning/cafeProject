/* Logging a new cafe, on one screen.

   The new-visit form was 2,424px tall on a phone — 3.4 screens — with the drinks 1,180px down
   and "How was it?" 2,120px down, because the location map, area, brand, photo and tags all
   sat open between the name and the drink. Google fills the pin, area and country the moment
   you pick the place, so all of that was already answered. Now it reads in the order you know
   things at the counter: the cafe, what you had, how it was, a line, Save. The place folds into
   one line that says what Google filled in; everything else folds under More. */
const { serve, launch, checker } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await pg.waitForTimeout(600);

  /* what picking "HI NRG" from the suggestions does, minus the Maps call */
  const pickFromGoogle = () => pg.evaluate(() => {
    $("f-name").value = "HI NRG"; formPid = "ChIJ-hinrg"; formCC = "US"; refreshRowCcy();
    picked = { lat: 21.2946, lng: -157.8254 }; $("f-area").value = "Little Russia"; syncWhere();
  });

  // ---- the place line ----------------------------------------------------
  let r = await pg.evaluate(() => {
    isAdmin = true; applyMode(); cafes = []; listTab = "been"; _formSnap = null; openForm();
    return { text: $("f-where-text").textContent, act: $("f-where-act").textContent,
             located: $("f-details").classList.contains("located"), open: $("f-details").open };
  });
  eq(r, { text: "No location yet", act: "Add pin", located: false, open: false },
     "with nothing known the place line says so, and offers the pin");

  await pickFromGoogle();
  r = await pg.evaluate(() => ({ text: $("f-where-text").textContent, act: $("f-where-act").textContent,
                                 located: $("f-details").classList.contains("located") }));
  eq(r, { text: "Little Russia · from Google", act: "Change", located: true },
     "after a Google pick it reads as one sentence about where it is");

  await pg.click("#f-where");
  /* <details> fires "toggle" a task after the click, so give the label that one tick */
  await pg.waitForFunction(() => $("f-where-act").textContent === "Done", null, { timeout: 2000 }).catch(() => {});
  r = await pg.evaluate(() => ({ open: $("f-details").open, act: $("f-where-act").textContent,
                                 map: $("form-map").getBoundingClientRect().height > 0,
                                 area: $("f-area").getBoundingClientRect().height > 0 }));
  eq(r, { open: true, act: "Done", map: true, area: true }, "tapping it opens the pin and the area to change them");
  await pg.click("#f-where");
  eq(await pg.evaluate(() => $("f-details").open), false, "…and tapping again folds them back");

  r = await pg.evaluate(() => { $("f-area").value = "<b>x</b>"; syncWhere(); const h = $("f-where-text").innerHTML;
                                $("f-area").value = "Little Russia"; syncWhere(); return h; });
  eq(r.includes("&lt;b&gt;x&lt;/b&gt;"), true, "an area is shown as text, never as markup");

  // ---- one screen --------------------------------------------------------
  r = await pg.evaluate(() => {
    document.querySelector("#f-drinks .dn").value = "Cafe latte";
    document.querySelector("#f-drinks .dp").value = "6.50";
    setBucket("loved"); $("f-review").value = "Vibes are super good, the coffee is strong here";
    const sc = document.querySelector("#pane-form .scroll");
    const bottom = sel => document.querySelector(sel).getBoundingClientRect().bottom;
    const fold = document.querySelector(".tabbar").getBoundingClientRect().top;
    return { tall: sc.scrollHeight, fold, scrolled: sc.scrollTop,
             seen: ["#f-name", "#f-where", "#f-drinks .dn", "#f-drinks .dp", "#f-rate", "#f-review", "#f-more", ".savebar"]
                     .filter(s => bottom(s) > fold) };
  });
  eq(r.seen, [], "name, place, drink, price, verdict, note, More and Save all sit above the tab bar");
  eq(r.tall <= 844, true, "the whole form is one phone screen (" + r.tall + "px, was 2,424px)");

  // ---- the first drink ---------------------------------------------------
  r = await pg.evaluate(() => {
    const dr = document.querySelector("#f-drinks .dr");
    const shown = sel => { const el = dr.querySelector(sel); return !!el && el.getBoundingClientRect().height > 0; };
    const y = sel => Math.round(dr.querySelector(sel).getBoundingClientRect().top);
    return { quick: dr.classList.contains("quick"), name: shown(".dn"), price: shown(".dp"),
             size: shown(".sizesteps"), date: shown(".dd"), head: shown(".drhead"), oneLine: y(".dn") === y(".dp"),
             more: dr.querySelector(".drmore").textContent.replace(/\s+/g, " ").trim() };
  });
  eq([r.quick, r.name, r.price, r.oneLine], [true, true, true, true], "the first drink is a name and a price, on one line");
  eq([r.size, r.date, r.head], [false, false, false], "…with size, date and the rest folded away");
  eq(r.more, "Today · size, sweetness, ice, milk ▸", "…one labelled tap away, which says the date it assumed");

  await pg.click("#f-drinks .drmore");
  r = await pg.evaluate(() => { const dr = document.querySelector("#f-drinks .dr");
    return { quick: dr.classList.contains("quick"), size: dr.querySelector(".sizesteps").getBoundingClientRect().height > 0,
             more: dr.querySelector(".drmore").getBoundingClientRect().height > 0 }; });
  eq(r, { quick: false, size: true, more: false }, "that tap opens the full drink, and the tap itself goes away");

  r = await pg.evaluate(() => { saveForm(); const c = cafes[0], d = c.drinks[0], o = drinkOrders(d)[0];
    return { name: c.name, pid: c.pid, area: c.area, drink: d.n, price: String(o.p), date: o.date, rating: c.rating,
             today: localToday() }; });
  eq([r.name, r.pid, r.area, r.drink, r.price, r.date === r.today, r.rating],
     ["HI NRG", "ChIJ-hinrg", "Little Russia", "Cafe latte", "6.50", true, 5],
     "it saves like it always did: place, pin id, area, drink, price, today, and the verdict");

  /* a quick row that another drink pushes aside must still be visible as a row */
  r = await pg.evaluate(() => { cafes = []; _formSnap = null; openForm();
    const first = document.querySelector("#f-drinks .dr"); first.querySelector(".dn").value = "Mocha";
    addDrinkRow("", "", localToday());
    return { quick: first.classList.contains("quick"), head: first.querySelector(".drhead").getBoundingClientRect().height > 0,
             title: first.querySelector(".drtitle").textContent }; });
  eq([r.quick, r.head], [false, true], "adding another drink folds the first to its header rather than hiding it");
  eq(r.title.startsWith("Mocha"), true, "…and the header names it (" + r.title + ")");

  // ---- More --------------------------------------------------------------
  r = await pg.evaluate(() => { cafes = []; _formSnap = null; openForm();
    const blank = $("f-more-sum").textContent;
    $("f-more").open = true;
    $("f-fav").checked = true; $("f-fav").dispatchEvent(new Event("change", { bubbles: true }));
    toggleTag("cozy"); toggleTag("matcha");
    $("f-brand").value = "Tadaima"; $("f-brand").dispatchEvent(new Event("input", { bubbles: true }));
    return { blank, set: $("f-more-sum").textContent }; });
  eq(r.blank, "photo, tags, brand, favourite, wishlist, private", "shut and empty, More lists what it holds");
  eq(r.set, "Favourite · Tadaima · 2 tags", "once anything is set, it says what — so a tick is never out of sight");

  r = await pg.evaluate(() => {
    cafes = [{ id: "w1", name: "Fuglen", area: "Shibuya", lat: 35.66, lng: 139.69, wish: true, fav: false, tags: ["cozy"], drinks: [] },
             { id: "f1", name: "Kissaten", area: "Tokyo", lat: 35.6, lng: 139.7, fav: true, tags: ["cozy", "matcha"],
               drinks: [{ n: "Hojicha latte", orders: [{ date: "2026-09-01" }] }] }];
    openForm("f1"); const edit = { open: $("f-more").open, sum: $("f-more-sum").textContent };
    openForm("w1"); const wish = { open: $("f-more").open, sum: $("f-more-sum").textContent, title: $("form-title").textContent };
    curId = "w1"; logDrinkHere();
    const logged = { open: $("f-more").open, wish: $("f-wish").checked, sum: $("f-more-sum").textContent };
    return { edit, wish, logged }; });
  eq(r.edit, { open: false, sum: "Favourite · 2 tags" }, "editing a favourite keeps More shut, and its summary says so");
  eq(r.wish, { open: true, sum: "Want to try", title: "Edit visit" },
     "editing a wishlist place opens More, so it is plain why there are no drinks");
  eq([r.logged.open, r.logged.wish, r.logged.sum], [false, false, "1 tag"],
     "logging a drink there unticks it and folds More away again");

  eq(errs, [], "no page errors");
  const ok = done();
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
