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

  // ---- the chip and list in the detail page ----
  const eight = [];
  ["Mission", "Marina", "Sunset", "Richmond", "Hayes Valley", "Ferry Building", "Union Square", "Noe Valley"].forEach((p, i) =>
    eight.push({ id: "m" + i, name: "Molly Tea (" + p + ")", area: p, brand: "Molly Tea", rating: 4 })
  );
  eight.push(
    { id: "long", name: "Molly Tea (The Very Long Name Of A Shopping Centre Branch)", area: "", brand: "Molly Tea" },
    { id: "solo", name: "Hermit Cafe", area: "Nowhere", brand: "Hermit" },
    { id: "plain", name: "Plain Cafe", area: "Elsewhere" }
  );
  await set(eight);
  r = await pg.evaluate(() => {
    openDetail("m0", "list");
    const w = $("d-where"),
      l = $("d-locs"),
      bar = w.getBoundingClientRect(),
      body = document.querySelector("#pane-detail .dbody").getBoundingClientRect();
    return {
      barName: w.querySelector(".wname").textContent,
      barCount: w.querySelector(".wcount").textContent,
      chipShown: !w.hidden,
      metaHidden: $("d-meta").hidden,
      title: $("d-name").textContent,
      fullName: $("d-name").title,
      place: $("d-meta").textContent,
      emoji: /\u{1F4CD}/u.test(w.parentElement.textContent),
      listHidden: l.hidden,
      expanded: w.getAttribute("aria-expanded"),
      chipH: bar.height,
      belowRating: bar.top >= $("d-stars").getBoundingClientRect().bottom,
      fullWidth: Math.abs(bar.width - (body.width - 32)) <= 1,
    };
  });
  eq([r.barName, r.barCount], ["Mission", "9 branches"], "a bar under the header names this branch and says how many branches there are");
  eq([r.title, r.fullName, r.place], ["Molly Tea", "Molly Tea (Mission)", "Mission"],
     "the title is the brand and the place is in the bar, instead of naming the place twice (the full name is on hover)");
  eq([r.chipShown, r.metaHidden, r.listHidden, r.expanded, r.emoji], [true, true, true, "false", false], "the place leaves the rating row for the bar, the list starts shut, and there is no pin emoji");
  eq([r.belowRating, r.fullWidth], [true, true], "the bar has its own row under the rating and spans the card");
  eq(r.chipH >= 48, true, "the bar is a 48px target (" + r.chipH + ")");

  r = await pg.evaluate(() => {
    $("d-where").click();
    const l = $("d-locs"),
      rows = [...l.querySelectorAll(".br:not(.add)")];
    l.getAnimations().forEach(a => a.finish()); /* measure the sheet where it settles, not mid-slide */
    const longRow = rows.find(x => /Shopping Centre/.test(x.textContent));
    return {
      open: !l.hidden,
      expanded: $("d-where").getAttribute("aria-expanded"),
      n: rows.length,
      tag: rows[0].tagName,
      cur: rows.filter(x => x.getAttribute("aria-current") === "true").map(x => x.querySelector(".t").textContent),
      minH: Math.min(...rows.map(x => x.getBoundingClientRect().height)),
      boxH: l.getBoundingClientRect().height,
      pageOver: document.documentElement.scrollWidth - innerWidth,
      add: !!l.querySelector(".add"),
      full: longRow ? longRow.querySelector(".t").textContent : null,
      order: rows.slice(0, 3).map(x => x.querySelector(".t").textContent),
      pos: getComputedStyle(l).position,
      onTabBar: Math.round(l.getBoundingClientRect().bottom) === Math.round(document.querySelector(".tabbar").getBoundingClientRect().top),
      scrim: !$("d-scrim").hidden && getComputedStyle($("d-scrim")).position === "fixed",
      head: getComputedStyle(l.querySelector(".brhead")).display !== "none",
      done: !!l.querySelector(".brdone"),
      focus: document.activeElement.classList.contains("on"),
    };
  });
  eq([r.open, r.expanded, r.n, r.tag], [true, "true", 9, "BUTTON"], "tapping the bar opens a list of real buttons, one per branch");
  eq(r.cur, ["Mission"], "the current branch is marked");
  eq(r.minH >= 52, true, "on a phone every row is at least 52px tall (" + r.minH + ")");
  eq([r.pos, r.onTabBar, r.scrim, r.head, r.done], ["fixed", true, true, true, true], "on a phone the list is a bottom sheet on a scrim above the tab bar, with a grab bar, a title and Done");
  eq([r.boxH <= 812 * 0.78 + 1, r.pageOver <= 0], [true, true], "nine branches fit under 78% of the screen (" + r.boxH + "px); the page does not scroll sideways");
  eq(r.focus, true, "focus moves into the list, onto the current branch");
  eq(r.full, "The Very Long Name Of A Shopping Centre Branch", "a long branch name is shown whole, not cut");
  eq(r.add, true, "the owner gets ＋ Add branch at the bottom");

  await pg.setViewportSize({ width: 375, height: 500 });
  r = await pg.evaluate(() => {
    const l = $("d-locs"),
      add = l.querySelector(".add");
    add.scrollIntoView({ block: "end" });
    const lb = l.getBoundingClientRect(),
      ab = add.getBoundingClientRect();
    return { scrolls: l.scrollHeight > l.clientHeight, boxH: lb.height, addIn: ab.bottom <= lb.bottom + 1 && ab.top >= lb.top, headStays: l.querySelector(".brhead").getBoundingClientRect().top >= lb.top - 1 };
  });
  eq([r.scrolls, r.boxH <= 500 * 0.78 + 1, r.addIn, r.headStays], [true, true, true, true], "on a short screen the sheet scrolls inside itself, the title stays put and the last row is reachable (" + r.boxH + "px)");
  await pg.setViewportSize({ width: 375, height: 812 });

  r = await pg.evaluate(() => {
    openDetail("m0", "list"); /* what the cloud echo does after a save */
    const same = !$("d-locs").hidden;
    [...$("d-locs").querySelectorAll(".br")].find(x => x.querySelector(".t").textContent === "Marina").click();
    return { same, cur: curId, shut: $("d-locs").hidden, scrimShut: $("d-scrim").hidden, place: $("d-where").querySelector(".wname").textContent };
  });
  eq(r.same, true, "a repaint of the same cafe leaves the list open");
  eq([r.cur, r.shut, r.scrimShut], ["m1", true, true], "tapping a branch opens it, and the list and scrim close");
  eq(r.place, "Marina", "…and the bar now names that branch");

  r = await pg.evaluate(() => {
    isAdmin = false;
    applyMode();
    openDetail("m0", "list");
    $("d-where").click();
    const add = $("d-locs").querySelector(".add");
    const vis = add ? getComputedStyle(add).display !== "none" : false;
    const n = $("d-locs").querySelectorAll(".br:not(.add)").length;
    $("d-locs").querySelectorAll(".br:not(.add)")[2].click();
    const out = { vis, n, switched: curId !== "m0" };
    openDetail("solo", "list");
    out.soloChip = $("d-where").hidden;
    out.soloMeta = $("d-meta").hidden;
    isAdmin = true;
    applyMode();
    return out;
  });
  eq(r, { vis: false, n: 9, switched: true, soloChip: true, soloMeta: false }, "a viewer can switch branches but never sees ＋ Add branch; a lone cafe keeps its plain area line");

  r = await pg.evaluate(() => {
    openDetail("solo", "list");
    const chip = $("d-where").querySelector(".wcount").textContent.trim(),
      place = $("d-where").querySelector(".wname").textContent;
    $("d-where").click();
    const rows = [...$("d-locs").querySelectorAll(".br")].map(x => x.textContent.replace(/\s+/g, " ").trim());
    openDetail("plain", "list");
    return { chip, place, rows, plain: $("d-where").hidden };
  });
  eq([r.chip, r.place], ["＋ Branch", "Nowhere"], "a lone cafe with a brand offers ＋ Branch to the owner, in the bar beside its place");
  eq(r.rows, ["Nowhere", "Add a branch"], "…and opening it lists itself and the add row");
  eq(r.plain, true, "a lone cafe with no brand shows no chip");

  // ---- how the list looks and behaves ----
  await set([
    { id: "h1", name: "HEYTEA (Cupertino)", area: "Cupertino", brand: "HEYTEA", rating: 5 },
    { id: "h2", name: "HEYTEA (South San Francisco)", area: "South San Francisco", brand: "HEYTEA", rating: 3 },
    { id: "h3", name: "HEYTEA (Palo Alto)", area: "Palo Alto", brand: "HEYTEA", wish: true },
    { id: "h4", name: "HEYTEA (Fremont)", area: "Fremont", brand: "HEYTEA", rating: 1 },
  ]);
  r = await pg.evaluate(() => {
    openDetail("h1", "list");
    const drinksTop = () => Math.round($("d-drinks").getBoundingClientRect().top);
    const shut = drinksTop();
    $("d-where").click();
    const open = drinksTop();
    const l = $("d-locs"),
      rows = [...l.querySelectorAll(".br:not(.add)")];
    const cs = getComputedStyle(l);
    return {
      shut, open, pos: cs.position, shadow: cs.boxShadow !== "none",
      checks: rows.map(x => !!x.querySelector(".ck")),
      cur: rows.map(x => x.classList.contains("on")),
      dots: rows.map(x => !!x.querySelector(".brdot")),
      tags: rows.map(x => !!x.querySelector(".brtag")),
      small: rows.map(x => x.querySelector("small").textContent),
      order: rows.map(x => x.querySelector(".t").textContent),
    };
  });
  eq(r.shut, r.open, "opening the list floats it over the page: nothing below it moves");
  eq([r.pos, r.shadow], ["fixed", true], "…as an elevated sheet");
  eq(r.order, ["Cupertino", "Fremont", "South San Francisco", "Palo Alto"], "each branch is its place, visited first and the wishlist one last");
  eq(r.checks.filter(Boolean).length, 1, "only the current branch carries a check");
  eq([r.dots.filter(Boolean).length, r.tags.filter(Boolean).length], [3, 1], "visited branches show a rating dot and the wishlist one a 🔖");
  eq(r.small, ["Loved it", "Not for me", "It was fine", "to try"], "each row says how you rated it, and the wishlist one says to try");

  r = await pg.evaluate(() => {
    const out = {};
    document.body.click();
    out.outside = $("d-locs").hidden;
    $("d-where").click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    out.escape = $("d-locs").hidden;
    out.focus = document.activeElement && document.activeElement.id;
    $("d-where").click();
    $("d-locs").querySelector(".br.on").click();
    out.inside = $("d-locs").hidden;
    $("d-where").click();
    $("d-scrim").click();
    out.scrim = $("d-locs").hidden && $("d-scrim").hidden;
    $("d-where").click();
    $("d-locs").querySelector(".brdone").click();
    out.done = $("d-locs").hidden && $("d-scrim").hidden;
    out.doneFocus = document.activeElement && document.activeElement.id;
    return out;
  });
  eq([r.outside, r.escape, r.focus], [true, true, "d-where"], "a tap elsewhere or Escape puts the list away, and Escape returns focus to the bar");
  eq([r.scrim, r.done, r.doneFocus], [true, true, "d-where"], "tapping the scrim or Done puts the sheet away too, and Done returns focus to the bar");

  // ---- the header across devices ----
  const widths = [360, 375, 390, 430, 744, 768, 1024, 1440];
  const bad = [];
  for (const w of widths) {
    await pg.setViewportSize({ width: w, height: 900 });
    const m = await pg.evaluate(() => {
      openDetail("h2", "list");
      const row = (id) => document.getElementById(id);
      const w = row("d-where"), st = row("d-stars");
      const box = (e) => e.getBoundingClientRect();
      const pane = document.getElementById("pane-detail").getBoundingClientRect();
      const out = { over: document.documentElement.scrollWidth - innerWidth, ctl: Math.round(box(w).height), ctlW: Math.round(box(w).width) };
      out.inView = [st, w].every(e => box(e).right <= pane.right + 1 && box(e).left >= pane.left - 1);
      out.title = row("d-name").textContent;
      const wn = w.querySelector(".wname");
      out.cut = wn.scrollWidth > wn.clientWidth;
      out.ratingRow = Math.round(box(row("d-stars")).height);
      w.click();
      const l = row("d-locs"), lb = box(l);
      out.pos = getComputedStyle(l).position;
      out.listIn = lb.left >= 0 && lb.right <= innerWidth && lb.right <= pane.right + 1 && lb.top >= 0 && lb.bottom <= innerHeight + 1;
      out.rowH = Math.min(...[...l.querySelectorAll(".br")].map((e) => Math.round(box(e).height)));
      w.click();
      return out;
    });
    const sheet = w < 900;
    if (m.over > 0 || m.ctl < 48 || !m.inView || !m.listIn || m.rowH < (sheet ? 52 : 48) || m.title !== "HEYTEA" || m.cut || m.pos !== (sheet ? "fixed" : "absolute")) bad.push(w + ": " + JSON.stringify(m));
  }
  eq(bad, [], "at 360 to 1440px a long place (South San Francisco · 4 branches) shows whole in a 48px bar under the rating, with no sideways scroll, and the list is a sheet below 900px and a card from 900px, always on screen");
  await pg.setViewportSize({ width: 375, height: 812 });

  // ---- + Branch ----
  let r2;
  await set([
    { id: "s1", name: "Molly Tea (San Mateo)", area: "San Mateo", brand: "Molly tea", lat: 37.56, lng: -122.32, pid: "P1", cc: "US", ccy: "USD", rating: 5, review: "great", photo: null, tags: ["cozy"], fav: true, drinks: [] },
  ]);
  r = await pg.evaluate(() => {
    openDetail("s1", "list");
    $("d-locs").querySelector(".br.add").click();
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
  r2 = await pg.evaluate(() => ({ badge: $("f-link").textContent.trim(), boxHidden: $("f-brand").closest(".field").hidden }));
  eq(r2, { badge: "🔗 New branch of Molly tea", boxHidden: true }, "the brand shows as a locked badge, and the brand box is out of the way");
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

  // ---- the chip's own buttons ----
  r = await pg.evaluate(() => {
    openForm();
    $("f-name").value = "Molly Tea - Fremont";
    autoBrand();
    const out = { linked: $("f-link").textContent.replace(/\s+/g, " ").trim(), boxHidden: $("f-brand").closest(".field").hidden };
    const btns = [...$("f-link").querySelectorAll("button")];
    out.btnH = Math.min(...btns.map(x => x.getBoundingClientRect().height));
    editBrand();
    out.editShown = !$("f-brand").closest(".field").hidden;
    out.editOpen = $("f-more").open;
    $("f-brand").dispatchEvent(new Event("blur"));
    out.after = $("f-link").textContent.replace(/\s+/g, " ").trim();
    unlinkBrand();
    out.unlinked = { brand: $("f-brand").value, chip: $("f-link").textContent.replace(/\s+/g, " ").trim(), boxShown: !$("f-brand").closest(".field").hidden };
    $("f-name").value = "Molly Tea - Palo Alto";
    autoBrand();
    out.stays = $("f-brand").value;
    relinkBrand();
    out.relinked = $("f-brand").value;
    return out;
  });
  eq(r.linked, "🔗 Linked to Molly tea (2 spots)EditUnlink", "an unlinked-looking form shows a chip: the brand and how many spots, with Edit and Unlink");
  eq([r.boxHidden, r.btnH >= 44], [true, true], "the brand box is hidden and the chip's buttons are 44px");
  eq([r.editShown, r.editOpen, r.after], [true, true, "🔗 Linked to Molly tea (2 spots)EditUnlink"], "Edit brings the box back under More, and leaving it returns to the chip");
  eq(r.unlinked, { brand: "", chip: "Link to Molly tea", boxShown: true }, "Unlink clears the brand, shows the box, and offers to link again");
  eq(r.stays, "", "an unlinked cafe is not re-linked by the detector as you keep typing");
  eq(r.relinked, "Molly tea", "Link again puts the brand back");

  eq(errs, [], "no page errors");
  const ok = done();
  await b.close();
  srv.close();
  process.exit(ok ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
