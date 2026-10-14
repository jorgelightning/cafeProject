/* The branches of a brand.

   The detail page had a row of "other locations" pills, but they wrapped (a chain with eight
   branches pushed the page down), were 28px tall, took the area as the label (two San Francisco
   branches both read "San Francisco"), and offered no way to add the next branch. Now: one
   scrolling row of 44px buttons labelled by the place in the name, a "+ Branch" for the owner, and
   the new branch's form starts with the brand, the name and the country, and offers the drinks you
   order at the brand's other branches. */
const { serve, launch, checker } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const pg = await b.newPage({ viewport: { width: 375, height: 812 } });
  await pg.route("**://**", r => (r.request().url().startsWith(srv.origin) ? r.continue() : r.abort()));
  const errs = [];
  pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await pg.waitForTimeout(600);

  const set = list =>
    pg.evaluate(list => {
      cafes = list.map(c => Object.assign({ drinks: [] }, c));
      isAdmin = true;
      applyMode();
      window.markerClusterer = undefined;
    }, list);

  // ---- labels ----
  await set([
    { id: "a", name: "Blue Bottle - Ferry Building", area: "San Francisco", brand: "Blue Bottle" },
    { id: "b", name: "Blue Bottle - Hayes Valley", area: "San Francisco", brand: "Blue Bottle" },
    { id: "c", name: "Blue Bottle Oakland", area: "Oakland", brand: "Blue Bottle" },
    { id: "d", name: "Blue Bottle", area: "Berkeley", brand: "Blue Bottle" },
    { id: "w", name: "Blue Bottle (Palo Alto)", area: "Palo Alto", brand: "Blue Bottle", wish: true },
    { id: "z", name: "Somewhere Else", area: "Oakland" },
  ]);
  let r = await pg.evaluate(() => getBrandSiblings(cafes[0]).map(x => x.label + (x.wish ? "*" : "") + (x.current ? "!" : "")));
  eq(
    r,
    ["Berkeley", "Ferry Building!", "Hayes Valley", "Oakland", "Palo Alto*"],
    "labels are the place in the name; two branches in one area are told apart by it; the wishlist branch sorts last"
  );
  r = await pg.evaluate(() => getBrandSiblings(cafes[5]));
  eq(r, [], "a cafe on its own has no branches");
  await set([
    { id: "a", name: "Cafe Tea", area: "Sunset", brand: "Cafe Tea" },
    { id: "b", name: "Cafe Tea", area: "Sunset", brand: "Cafe Tea" },
    { id: "c", name: "Cafe Tea Extraordinarily Long Neighbourhood Name", area: "", brand: "Cafe Tea" },
  ]);
  r = await pg.evaluate(() => getBrandSiblings(cafes[0]).map(x => x.label));
  eq(r.slice().sort(), ["Sunset", "Sunset 2", r.find(x => x.length > 10 && x !== "Sunset 2")].sort(), "branches that still clash get a number, and a long label is cut with an ellipsis");
  eq(r.every(x => x.length <= 18), true, "no label is longer than 16 characters plus a number");

  // ---- the row in the detail page ----
  const eight = [];
  ["Mission", "Marina", "Sunset", "Richmond", "Hayes Valley", "Ferry Building", "Union Square", "Noe Valley"].forEach((p, i) =>
    eight.push({ id: "m" + i, name: "Molly Tea (" + p + ")", area: p, brand: "Molly Tea" })
  );
  eight.push({ id: "solo", name: "Hermit Cafe", area: "Nowhere", brand: "Hermit" }, { id: "plain", name: "Plain Cafe", area: "Elsewhere" });
  await set(eight);
  r = await pg.evaluate(() => {
    openDetail("m0", "list");
    const row = $("d-locs"),
      pills = [...row.querySelectorAll(".locpill:not(.add)")];
    const tops = new Set(pills.map(p => Math.round(p.getBoundingClientRect().top)));
    return {
      n: pills.length,
      tag: pills[0].tagName,
      cur: pills.filter(p => p.getAttribute("aria-current") === "true").map(p => p.textContent),
      oneLine: tops.size,
      minH: Math.min(...pills.map(p => p.getBoundingClientRect().height)),
      scrolls: row.scrollWidth > row.clientWidth,
      pageOver: document.documentElement.scrollWidth - innerWidth,
      add: !!row.querySelector(".add"),
    };
  });
  eq([r.n, r.tag, r.cur], [8, "BUTTON", ["Mission"]], "eight pills, real buttons, the current one marked");
  eq([r.oneLine, r.scrolls, r.pageOver <= 0], [1, true, true], "at 375px they stay on one line and scroll inside the row; the page does not scroll sideways");
  eq(r.minH >= 44, true, "each is at least 44px tall (" + r.minH + ")");
  eq(r.add, true, "the owner gets a + Branch");

  r = await pg.evaluate(() => {
    const p = [...$("d-locs").querySelectorAll(".locpill")].find(x => x.textContent === "Marina");
    p.click();
    return { cur: curId, name: $("d-name").textContent, on: $("d-locs").querySelector(".on").textContent };
  });
  eq([r.cur, r.on], ["m1", "Marina"], "tapping a pill opens that branch");

  r = await pg.evaluate(() => {
    isAdmin = false;
    applyMode();
    openDetail("m0", "list");
    const add = $("d-locs").querySelector(".add");
    const vis = add ? getComputedStyle(add).display !== "none" : false;
    const n = $("d-locs").querySelectorAll(".locpill:not(.add)").length;
    $("d-locs").querySelectorAll(".locpill:not(.add)")[2].click();
    const out = { vis, n, switched: curId !== "m0" };
    isAdmin = true;
    applyMode();
    return out;
  });
  eq(r, { vis: false, n: 8, switched: true }, "a viewer can switch branches but never sees + Branch");

  r = await pg.evaluate(() => {
    openDetail("solo", "list");
    const a = getComputedStyle($("d-locs")).display + "|" + $("d-locs").textContent.trim();
    openDetail("plain", "list");
    return { solo: a, plain: getComputedStyle($("d-locs")).display };
  });
  eq(r, { solo: "flex|＋ Branch", plain: "none" }, "a lone cafe with a brand offers only + Branch to the owner; one with no brand shows nothing");

  // ---- + Branch ----
  await set([
    { id: "s1", name: "Molly Tea (San Mateo)", area: "San Mateo", brand: "Molly tea", lat: 37.56, lng: -122.32, pid: "P1", cc: "US", ccy: "USD", rating: 5, review: "great", photo: null, tags: ["cozy"], fav: true, drinks: [] },
  ]);
  r = await pg.evaluate(() => {
    openDetail("s1", "list");
    $("d-locs").querySelector(".add").click();
    return {
      view: app.dataset.view,
      title: $("form-title").textContent,
      name: $("f-name").value,
      brand: $("f-brand").value,
      area: $("f-area").value,
      pid: formPid,
      cc: formCC,
      ccy: formCcy,
      pin: picked,
      rating: formRating,
      review: $("f-review").value,
      fav: $("f-fav").checked,
      tags: formTags.length,
      editing: editId,
    };
  });
  eq([r.view, r.title, r.name, r.brand], ["form", "Add a branch", "Molly Tea", "Molly tea"], "+ Branch opens a new form with the brand and the name");
  eq([r.cc, r.ccy], ["US", "USD"], "…and the country and currency");
  eq([r.area, r.pid, r.pin, r.rating, r.review, r.fav, r.tags, r.editing], ["", "", null, 0, "", false, 0, null], "…but not the place, pin, place id, rating, review, favourite, tags — it is a new cafe");

  r = await pg.evaluate(() => {
    checkExisting();
    const noPin = editId;
    $("f-name").value = "Molly Tea";
    $("f-area").value = "Palo Alto";
    picked = { lat: 37.44, lng: -122.16 };
    checkExisting();
    const elsewhere = editId;
    $("f-name").value = "Molly Tea (San Mateo)";
    picked = { lat: 37.56, lng: -122.32 };
    $("f-area").value = "San Mateo";
    checkExisting();
    return { noPin, elsewhere, same: editId };
  });
  eq([r.noPin, r.elsewhere], [null, null], "while the new branch has no pin, and when it lands somewhere else, the sibling is not opened in its place");
  eq(r.same, "s1", "…but a pin on top of the sibling is still recognised as the same place");

  // ---- usuals across branches ----
  await set([
    {
      id: "s1",
      name: "Molly Tea (San Mateo)",
      area: "San Mateo",
      brand: "Molly tea",
      drinks: [{ n: "Brown Sugar Boba", orders: [{ date: "2026-05-01", size: "16 oz", sweet: "50%", ice: "Less", p: "6.5", qty: 1 }] }],
    },
    { id: "o1", name: "Other Place", area: "X", drinks: [{ n: "One Off Latte", orders: [{ date: "2026-05-02", size: "Small", qty: 1 }] }] },
    { id: "o2", name: "Third Place", area: "Y", drinks: [{ n: "Americano", orders: [{ date: "2026-05-02", qty: 1 }, { date: "2026-05-03", qty: 1 }] }] },
  ]);
  r = await pg.evaluate(() => {
    openForm({ branchOf: "s1" });
    const chips = [...document.querySelectorAll("#f-usuals .uchip")].map(x => x.firstChild.textContent);
    const lbl = document.querySelector("#f-usuals .usuallbl").textContent;
    document.querySelector('#f-usuals .uchip[data-key="brown sugar boba"]').click();
    const row = document.querySelector("#f-drinks .dr");
    return {
      chips,
      lbl,
      name: row.querySelector(".dn").value,
      price: row.querySelector(".dp").value,
      size: row.querySelector(".dsz") && row.querySelector(".dsz").dataset.set === "1" ? row.querySelector(".dsz").value : null,
    };
  });
  eq(r.chips[0], "Brown Sugar Boba", "a drink ordered once at a sibling branch is offered first");
  eq(r.chips.includes("One Off Latte"), false, "a one-off at an unrelated cafe is still not a usual");
  eq(r.chips.includes("Americano"), true, "…and the usuals from everywhere else fill the rest");
  eq(r.lbl, "Log again · Molly tea", "the row says whose branches it came from");
  eq([r.name, r.price], ["Brown Sugar Boba", ""], "tapping adds the drink with the price left blank");
  eq(r.size != null, true, "…and the size you usually take (" + r.size + ")");

  r = await pg.evaluate(() => {
    openForm();
    return document.querySelector("#f-usuals .usuallbl").textContent;
  });
  eq(r, "Log again", "a form with no brand shows plain usuals");

  r = await pg.evaluate(() => {
    openForm();
    $("f-name").value = "Molly Tea - Fremont";
    autoBrand();
    return { lbl: document.querySelector("#f-usuals .usuallbl").textContent, first: document.querySelector("#f-usuals .uchip").firstChild.textContent };
  });
  eq([r.lbl, r.first], ["Log again · Molly tea", "Brown Sugar Boba"], "typing a chain's name switches the suggestions to that chain");

  eq(errs, [], "no page errors");
  const ok = done();
  await b.close();
  srv.close();
  process.exit(ok ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
