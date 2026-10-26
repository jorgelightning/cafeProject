/* A note on one cup.

   Standing at the counter with a bad drink, there was nowhere to say so: the closest was the 👍 😐 👎 for "Would order
   again?", three taps deep in the visit's Edit form. Now each drink on the cafe page has a ⋯ (for the owner) that opens
   a sheet about its newest cup: a note with tags, the 👍 😐 👎 on one tap, log another today, or edit the visit.

   The note belongs to the cup, not the drink: it shows under the drink with which cup it was, and when another cup went
   the other way ("Oct 5 was 👍"), so one bad cup does not read as the drink always being bad. Everyone sees it, as they
   see My thoughts. It survives the Edit form, and the sync merges it like any other change to an order. */
const { serve, launch, checker, ready } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => (r.request().url().startsWith(srv.origin) ? r.continue() : r.abort()));
  const errs = [];
  pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await ready(pg);

  const T = await pg.evaluate(() => {
    const today = localToday();
    isAdmin = true;
    applyMode();
    cafes = [
      {
        id: "jd",
        name: "Jandii Cafe",
        area: "Parkside",
        rating: 5,
        drinks: [
          {
            n: "Matcha Einspanner Latte",
            orders: [
              { id: "o1", date: "2026-10-05", p: "9.60", size: "14 oz", sweet: "0%", reorder: "yes" },
              { id: "o2", date: today, p: "9.60", size: "14 oz", sweet: "0%" },
            ],
          },
          /* an old drink from before orders had ids: dates only */
          { n: "Matcha Einspanner", dates: ["2026-07-03"], reorder: "yes" },
        ],
      },
    ];
    openDetail("jd", "list");
    return today;
  });

  /* ---- the ⋯ and the menu ---- */
  const btns = await pg.evaluate(() => [...document.querySelectorAll("#d-drinks .drinkmore")].map(b => b.getAttribute("aria-label")));
  eq(btns, ["More for Matcha Einspanner Latte", "More for Matcha Einspanner"], "the owner gets a ⋯ on every drink, named for the drink");
  await pg.locator('.drinkmore[data-drink="Matcha Einspanner Latte"]').click();
  const menu = await pg.evaluate(() => ({
    open: !$("dnsheet").hidden,
    title: $("dns-title").textContent,
    items: [...document.querySelectorAll("#dns-panel .dnmi")].map(x => x.textContent.replace(/\s+/g, " ").trim()),
    focus: document.activeElement && document.activeElement.textContent.trim(),
  }));
  eq([menu.open, menu.title], [true, "Matcha Einspanner Latte"], "it opens a sheet for that drink");
  eq(menu.items, ["Add a notefor today’s cup", "Would order again?👍😐👎", "＋Log another today", "Edit in the visit…"], "…a note on today's cup, would you order it again, log another, edit the visit");
  eq(/Add a note/.test(menu.focus || ""), true, "…with the keyboard on its first choice");

  /* one tap of 👎 from the menu saves it on today's cup, and only that cup */
  await pg.getByRole("button", { name: "Would order again: no" }).click();
  let st = await pg.evaluate(() => {
    const o = cafes[0].drinks[0].orders;
    return { o1: o.find(x => x.id === "o1").reorder, o2: o.find(x => x.id === "o2").reorder, card: document.querySelector("#d-drinks .drinkcard").className, open: !$("dnsheet").hidden };
  });
  eq([st.o1, st.o2], ["yes", "no"], "👎 from the menu lands on today's cup and leaves the October 5th one as it was");
  eq([/v-no/.test(st.card), st.open], [true, true], "…the card's edge turns red, and the sheet stays open");

  /* ---- writing the note ---- */
  await pg.getByRole("button", { name: /Add a note/ }).click();
  const nm = await pg.evaluate(() => ({
    title: $("dns-title").textContent,
    tags: [...document.querySelectorAll("#dns-panel .dntag")].map(x => x.textContent),
    pressed: document.querySelector('#dns-panel .dnv.no').getAttribute("aria-pressed"),
    focus: document.activeElement && document.activeElement.id,
  }));
  eq(nm.title, "A note on today’s cup", "Add a note asks about today's cup");
  eq([nm.pressed, nm.focus], ["true", "dns-text"], "…keeps the 👎 already chosen and puts the cursor in the words");
  eq(nm.tags.slice(0, 3), ["Too sweet", "Not sweet enough", "Too bitter"], "…and offers what was off");
  await pg.locator("#dns-text").fill("Matcha tasted burnt <b>and</b> the cream had gone flat");
  await pg.getByRole("button", { name: "Too bitter" }).click();
  await pg.getByRole("button", { name: "Burnt" }).click();
  /* switching to 👍 swaps the tags on offer, but keeps what you picked and what you typed */
  await pg.getByRole("button", { name: "Would order again: yes" }).click();
  const sw = await pg.evaluate(() => ({ tags: [...document.querySelectorAll("#dns-panel .dntag")].map(x => x.textContent), text: $("dns-text").value }));
  eq(sw.tags, ["Just right", "Rich", "Smooth", "Great value", "Pretty", "Too bitter", "Burnt"], "👍 offers what was good, and the tags already picked stay on show");
  eq(/burnt <b>and<\/b>/.test(sw.text), true, "…without losing the words");
  await pg.getByRole("button", { name: "Would order again: no" }).click();
  await pg.getByRole("button", { name: "Save note" }).click();

  st = await pg.evaluate(() => {
    const d = cafes[0].drinks[0],
      o2 = d.orders.find(x => x.id === "o2"),
      o1 = d.orders.find(x => x.id === "o1");
    const card = document.querySelector("#d-drinks .drinkcard"),
      note = card.querySelector(".drinknote");
    return {
      o2: [o2.reorder, o2.note, o2.tags],
      o1: [o1.reorder, o1.note || null, o1.tags || null],
      top: [d.note || null, d.tags || null],
      open: !$("dnsheet").hidden,
      focus: document.activeElement && document.activeElement.getAttribute("data-drink"),
      noteCls: note && note.className,
      pills: note ? [...note.querySelectorAll(".nt")].map(x => x.textContent) : [],
      q: note && note.querySelector(".ntq").textContent,
      bold: note ? note.querySelectorAll("b").length : -1,
      who: note && note.querySelector(".ntwho").textContent,
      hist: card.querySelectorAll(".dordernote").length,
    };
  });
  eq(st.o2, ["no", "Matcha tasted burnt <b>and</b> the cream had gone flat", ["Too bitter", "Burnt"]], "Save keeps the 👎, the tags and the words on today's cup");
  eq(st.o1, ["yes", null, null], "…and nothing on the October 5th cup");
  eq(st.top, [null, null], "…and the note is not copied up onto the drink's summary: one cup is not the drink");
  eq([st.open, st.focus], [false, "Matcha Einspanner Latte"], "the sheet closes and the keyboard goes back to that drink's ⋯");
  eq([st.noteCls, st.pills], ["drinknote v-no", ["👎", "Too bitter", "Burnt"]], "the note shows under the drink, tinted for 👎, with its tags");
  eq([st.q, st.bold], ["Matcha tasted burnt <b>and</b> the cream had gone flat", 0], "…in your words, as text (nothing in them becomes markup)");
  eq(st.who, "Today’s cup · Oct 5 was 👍", "…saying which cup it was, and that October 5th went the other way");
  eq(st.hist, 1, "…and the cup's own row in the history carries it too");

  /* ---- everyone sees it; only the owner gets the ⋯ ---- */
  const viewer = await pg.evaluate(() => {
    isAdmin = false;
    applyMode();
    openDetail("jd");
    const r = { more: document.querySelectorAll(".drinkmore").length, note: !!document.querySelector(".drinknote .ntq") };
    isAdmin = true;
    applyMode();
    openDetail("jd");
    return r;
  });
  eq(viewer, { more: 0, note: true }, "a visitor sees the note but gets no ⋯");

  /* ---- the Edit form carries it, so saving the visit does not drop it ---- */
  const form = await pg.evaluate(() => {
    openForm("jd");
    const shown = [...document.querySelectorAll("#f-drinks .dnt")].map(t => t.value).filter(Boolean);
    saveForm();
    const o2 = cafes[0].drinks.find(d => d.n === "Matcha Einspanner Latte").orders.find(x => x.id === "o2");
    return { shown, kept: [o2.note, o2.tags, o2.reorder] };
  });
  eq(form.shown, ["Matcha tasted burnt <b>and</b> the cream had gone flat"], "the visit's Edit form shows the cup's note, where it can be changed");
  eq(form.kept, ["Matcha tasted burnt <b>and</b> the cream had gone flat", ["Too bitter", "Burnt"], "no"], "…and saving the visit keeps the note, the tags and the 👎");

  /* ---- an old drink with no order ids gets them, so the sync can tell its cups apart ---- */
  await pg.evaluate(() => openDetail("jd"));
  await pg.locator('.drinkmore[data-drink="Matcha Einspanner"]').click();
  await pg.getByRole("button", { name: "Would order again: maybe" }).click();
  const legacy = await pg.evaluate(() => {
    const d = cafes[0].drinks.find(x => x.n === "Matcha Einspanner");
    return { ids: d.orders.every(o => !!o.id), rv: d.orders[0].reorder };
  });
  eq(legacy, { ids: true, rv: "neutral" }, "a drink logged before orders had ids gets them when you mark it, and keeps the 😐");
  await pg.keyboard.press("Escape");
  eq(await pg.evaluate(() => $("dnsheet").hidden), true, "Escape closes the sheet");
  await pg.locator('.drinkmore[data-drink="Matcha Einspanner"]').click();
  await pg.mouse.click(195, 60);
  eq(await pg.evaluate(() => $("dnsheet").hidden), true, "…and so does a tap on the dimmed page behind it");

  /* ---- removing it ---- */
  await pg.locator('.drinkmore[data-drink="Matcha Einspanner Latte"]').click();
  eq(await pg.evaluate(() => /Edit the note/.test($("dns-panel").textContent)), true, "with a note there, the menu offers to edit it");
  await pg.getByRole("button", { name: /Edit the note/ }).click();
  await pg.getByRole("button", { name: "Remove note" }).click();
  const gone = await pg.evaluate(() => {
    const o2 = cafes[0].drinks.find(d => d.n === "Matcha Einspanner Latte").orders.find(x => x.id === "o2");
    return [o2.note || null, o2.tags || null, o2.reorder, document.querySelectorAll(".drinknote").length];
  });
  eq(gone, [null, null, "no", 0], "Remove note clears the words and tags and keeps the 👎");

  /* ---- log another today ---- */
  await pg.locator('.drinkmore[data-drink="Matcha Einspanner Latte"]').click();
  await pg.getByRole("button", { name: "Log another today" }).click();
  await pg.waitForTimeout(100);
  const again = await pg.evaluate(() => {
    const on = document.querySelector('#dns-panel .dntag[aria-pressed="true"]');
    return { open: !$("dnsheet").hidden, title: $("dns-title").textContent, n: on && on.dataset.n, p: $("qc-price") && $("qc-price").value };
  });
  eq(again, { open: true, title: "A cup at Jandii Cafe", n: "Matcha Einspanner Latte", p: "9.60" }, "Log another today opens the quick cup on that drink, at the last price (tests/quick-cup.js has the rest)");
  await pg.evaluate(() => closeSheet());
  eq(T.length, 10, "today is a date");

  /* ---- two devices: a note on one, a price fix on the other, both survive ---- */
  const merged = await pg.evaluate(() => {
    const base = { id: "m", name: "M", drinks: [{ n: "Latte", orders: [{ id: "a", date: "2026-10-01", p: "6" }, { id: "b", date: "2026-10-02", p: "6" }] }] };
    const mine = JSON.parse(JSON.stringify(base)),
      theirs = JSON.parse(JSON.stringify(base));
    mine.drinks[0].orders[1].note = "Too sweet today";
    mine.drinks[0].orders[1].tags = ["Too sweet"];
    theirs.drinks[0].orders[0].p = "6.50";
    const r = syncMerge(base, mine, theirs);
    const out = r.value.drinks[0].orders;
    return [out.find(o => o.id === "a").p, out.find(o => o.id === "b").note, out.find(o => o.id === "b").tags, r.conflicts.length];
  });
  eq(merged, ["6.50", "Too sweet today", ["Too sweet"], 0], "a note written on the phone and a price fixed on the iPad merge without a question");

  eq(errs, [], "no page errors");
  await ctx.close();
  await b.close();
  srv.close();
  process.exit(done() ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
