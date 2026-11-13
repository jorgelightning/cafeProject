/* Scan a receipt (v127), in the page.

   A photo goes in through the real file box and is read on the phone. One drink goes straight to the filled-in sheet,
   several ask which were yours and then bring the sheet up once each, a payment screen says it only shows a total, and
   a photo it cannot read says so. Nothing is saved until you press Save, and nothing is sent anywhere. Most checks
   replace the text reader with the text it would have read; the last runs the real one on a drawn receipt, under the
   page's real Content Security Policy. What the parser makes of a receipt's text is tests/unit/scan.test.mjs. */
const { serve, launch, checker, ready, ROOT } = require("./harness");
const fs = require("fs");
const path = require("path");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => (r.request().url().startsWith(srv.origin) ? r.continue() : r.abort()));
  const errs = [];
  pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await ready(pg);

  const reset = () => pg.evaluate(() => {
    closeSheet();
    cafes = [{ id: "c1", name: "Sample Tea Bar", area: "Soma", lat: 37.77, lng: -122.4, rating: 4, drinks: [
      { n: "Cortado", orders: [{ id: "a", date: "2026-10-01", p: "5", size: "8 oz", sweet: "0%" }, { id: "b", date: "2026-10-02", p: "5", size: "8 oz", sweet: "0%" }] },
      { n: "Iced matcha latte", orders: [{ id: "c", date: "2026-10-03", p: "7" }] },
    ] }];
    privDetail = {};
    isAdmin = true;
    applyMode();
    openDetail("c1", "list");
  });

  await reset();
  let s = await pg.evaluate(() => {
    openQuickCup();
    const r = document.querySelector("#dns-panel .qcscan").getBoundingClientRect(), t = $("dns-title").getBoundingClientRect();
    return { milks: JSON.stringify(MILKS) === JSON.stringify(SCAN_MILK), ice: JSON.stringify(STAT_ICE) === JSON.stringify(SCAN_ICE),
             tall: r.height >= 44, clear: r.left >= t.right - 1, small: r.width < 120, oneLine: t.height < 32, wide: document.documentElement.scrollWidth <= innerWidth };
  });
  eq(s, { milks: true, ice: true, tall: true, clear: true, small: true, oneLine: true, wide: true }, "Scan is a small 44px button beside the title, which stays on one line, and the option lists match the app's");

  const photo = await pg.evaluate(() => { const c = document.createElement("canvas"); c.width = 3000; c.height = 1200; const g = c.getContext("2d"); g.fillStyle = "#b08040"; g.fillRect(0, 0, 3000, 1200); g.fillStyle = "#402010"; g.fillRect(0, 0, 500, 500); return c.toDataURL("image/png").split(",")[1]; });
  const file = () => ({ name: "r.png", mimeType: "image/png", buffer: Buffer.from(photo, "base64") });
  await pg.evaluate(() => {
    window.__realRead = scanRead;
    window.__stub = image => { window.__image = image; return Promise.resolve(window.__text); };
    scanRead = window.__stub;
  });
  /* every reading stops at the list to tick; with one row on it, the helpers press Log for the checks that come after */
  const one = async () => { if (await pg.evaluate(() => !$("dnsheet").hidden && document.querySelectorAll("#dns-panel .scanrow").length === 1)) await pg.click("#dns-panel .dnact .btn:last-child"); };
  /* a photo stops at its box before it is read (v135): `how` is "box" for Read this part, "stay" to stop there, else Whole photo */
  const shoot = async (f, how) => {
    await pg.setInputFiles("#scan-file", f);
    await pg.waitForFunction(() => { const i = $("scan-cropimg"); return $("scan-read") && i && i.complete && i.naturalWidth > 0; });
    if (how !== "stay") await pg.click(how === "box" ? "#scan-read" : "#scan-all");
  };
  const scan = async (lines, stay) => {
    await reset();
    await pg.evaluate(t => { window.__text = t; openQuickCup(); }, lines.join("\n"));
    await shoot(file());
    await pg.waitForFunction(() => !document.querySelector(".scanr"));
    if (!stay) await one();
  };
  const sheet = () => pg.evaluate(() => {
    const t = sel => { const e = document.querySelector("#dns-panel " + sel); return e ? e.textContent.trim() : null; };
    return { title: t("#dns-title"), from: t(".qcfrom"), same: t(".qcsame b"), spec: t(".qcsame span"), of: t(".qcof"), say: t("#qc-say"), scan: !!document.querySelector("#dns-panel .qcscan"),
             on: [...document.querySelectorAll('#dns-panel .dntag[aria-pressed="true"]')].map(x => x.textContent.trim()),
             price: ($("qc-price") || {}).value, save: [...document.querySelectorAll("#dns-panel .dnact .btn")].pop().textContent.trim(), date: t(".dnhead p"), focus: document.activeElement.id };
  });
  const orders = n => pg.evaluate(n => { const d = cafes[0].drinks.find(x => x.n === n); return d ? drinkOrders(d) : null; }, n);
  const save = () => pg.click("#dns-panel .dnact .btn:last-child");

  /* one drink: the list first, as for several (v130), then the sheet */
  await scan(["SAMPLE TEA BAR", "CORTADO 6.50", "+ OAT MILK", "TAX 0.70", "TOTAL 7.20"], true);
  s = await pg.evaluate(() => ({ title: $("dns-title").textContent, rows: [...document.querySelectorAll(".scanrow")].map(x => x.querySelector(".scantick").getAttribute("aria-pressed") + " " + x.querySelector(".scanname").value + " " + (v => (v ? "$" + v : ""))(x.querySelector(".scanprice").value)),
    printed: document.querySelector(".scantext small").textContent, go: [...document.querySelectorAll("#dns-panel .dnact .btn")].pop().textContent.trim(), saved: cafes[0].drinks[0].orders.length }));
  eq(s, { title: "Is this yours?", rows: ["true Cortado $6.50"], printed: "Printed: CORTADO + OAT MILK", go: "Log 1 cup", saved: 2 }, "one drink stops at the list too, showing what was printed beside what the app made of it");
  await one();
  s = await sheet();
  eq([s.title, s.from, s.on, s.price, s.say, s.scan, s.of, s.save],
     ["A cup at Sample Tea Bar", "Filled in from your receipt. Change anything.", ["Cortado 2"], "6.50", "From the receipt, before tax and tip.", false, null, "Save cup"],
     "Log 1 cup brings up the sheet, filled in, with the price and where it came from");
  eq([s.same, s.spec.includes("oat"), s.spec.includes("8 oz")], ["✓ From the receipt and last time", true, true], "…options printed on the receipt, last time's for the rest, and it says so");
  eq(s.focus, "dns-title", "…and it does not open the keyboard, since it is there to be checked");
  const pic = await pg.evaluate(() => { const c = window.__image, p = c.getContext("2d").getImageData(1000, 800, 1, 1).data; return { w: c.width, h: c.height, grey: p[0] === p[1] && p[1] === p[2] }; });
  eq(pic, { w: 2400, h: 960, grey: true }, "the reader gets the photo shrunk to 2400px and turned grey");
  eq((await orders("Cortado")).length, 2, "nothing is saved until you press Save");
  await save();
  let saved = (await orders("Cortado")).pop();
  eq([saved.p, saved.milk, saved.size, saved.sweet, await pg.evaluate(() => $("dnsheet").hidden)], ["6.50", "Oat", "8 oz", "0%", true], "Save logs the receipt's price and milk with last time's size and sweetness");

  /* a photo goes from its box straight to the drinks (v138): the text it read, a stop since v131, is one no longer */
  await reset();
  await pg.evaluate(() => { window.__text = "Xqzv 6.50\nTOTAL 6.50"; openQuickCup(); });
  await shoot(file());
  await pg.waitForFunction(() => { const i = document.querySelector("#dns-panel .scanthumb img"); return document.querySelector("#dns-panel .scanrow") && i && i.complete && i.naturalWidth > 0; });
  s = await pg.evaluate(() => ({ title: $("dns-title").textContent, box: !!$("scan-text"), back: document.querySelector("#dns-panel .dnact .btn").textContent, close: !!document.querySelector("#dns-panel .ocx"),
    blob: document.querySelector(".scanthumb img").src.startsWith("blob:"), saved: cafes[0].drinks.length, wide: document.documentElement.scrollWidth <= innerWidth,
    tick: document.querySelector(".scantick").getAttribute("aria-pressed"), note: document.querySelector(".scannote").textContent, go: $("scan-log").textContent + ($("scan-log").disabled ? " off" : ""),
    above: document.querySelector("#dns-panel .scanthumb").getBoundingClientRect().bottom <= document.querySelector(".scanlist").getBoundingClientRect().top }));
  eq(s, { title: "Is this yours?", box: false, back: "Adjust crop", close: true, blob: true, saved: 2, wide: true, tick: "true", note: "new here", go: "Log 1 cup", above: true },
     "a photo's reading goes straight to the list of drinks, with no text to check first: a priced line that names no drink it knows comes ticked and called new here (v140), your photo above the list to check against (v132), and nothing saved");
  await pg.fill("#dns-panel .scanname", "Flat white");
  s = await pg.evaluate(() => ({ tick: document.querySelector(".scantick").getAttribute("aria-pressed"), go: $("scan-log").textContent, focus: document.activeElement.className, tall: document.querySelector(".scanname").getBoundingClientRect().height >= 44 }));
  eq(s, { tick: "true", go: "Log 1 cup", focus: "scanname", tall: true }, "its name is a box: putting it right leaves the row ticked, and the cursor stays in the box");
  await pg.fill("#dns-panel .scanname", "  ");
  eq(await pg.evaluate(() => $("scan-log").textContent + ($("scan-log").disabled ? " off" : "")), "Tick a drink off", "a row with no name is not logged");
  await pg.click("#dns-panel .dnact .btn:first-child");
  await pg.waitForFunction(() => !!$("scan-read"));
  eq(await pg.evaluate(() => [$("dns-title").textContent, !!$("scan-text")]), ["Where’s the receipt?", false], "Adjust crop, where Back to the text was, goes back to the photo's box");
  await scan(["Cortado 6.50", "TOTAL 6.50"], true);
  await pg.fill("#dns-panel .scanname", "Cortado doppio");
  await pg.click("#scan-log");
  s = await sheet();
  eq([s.on, s.price], [["Cortado doppio"], "6.50"], "…and a name put right on the list is the name on the sheet");
  await save();
  eq((await orders("Cortado doppio")).map(o => o.p), ["6.50"], "…and the name it is saved under");
  await pg.evaluate(() => { window.__text = "  \n "; });
  await scan([" ", " "]);
  s = await pg.evaluate(() => [$("dns-title").textContent, document.querySelector(".dnhead p").textContent]);
  eq(s, ["Couldn’t read that", "Try your phone’s text reader instead, or type it in."], "a photo with no text in it at all says so");

  /* several items: tick yours, then a sheet each, on the receipt's date */
  const earlier = await pg.evaluate(() => new Date(Date.parse(localToday()) - 3 * 864e5).toISOString().slice(0, 10));
  await scan([earlier, "ICD MTCHA LT 6.75", "+ OAT MILK 1.00", "HOJI LT 16OZ 7.00", "LESS ICE", "CROISSANT 5.00", "SUBTOTAL 19.75", "TAX 1.73", "TOTAL 24.48"]);
  const pick = () => pg.evaluate(() => ({ title: $("dns-title").textContent, rows: [...document.querySelectorAll(".scanrow")].map(x => x.querySelector(".scantick").getAttribute("aria-pressed") + " " + x.querySelector(".scanname").value + " " + (v => (v ? "$" + v : ""))(x.querySelector(".scanprice").value)),
    meta: [...document.querySelectorAll(".scanrow")].map(x => [...x.querySelectorAll(".scantag, .scannote")].map(e => e.textContent).join(" · ")), go: [...document.querySelectorAll("#dns-panel .dnact .btn")].pop().textContent.trim(), foot: document.querySelector(".scanfoot").textContent }));
  let p = await pick();
  eq(p.rows, ["true Iced matcha latte $7.75", "true Hojicha latte $7.00", "false Croissant $5.00"], "several items ask which were yours: drinks ticked, food not");
  eq([p.title, p.go, p.foot], ["Which ones were yours?", "Log 2 cups", "Tax, tip and the total are left out."], "…and the button counts them");
  eq(p.meta, ["oat · had 1× here", "16 oz · less ice · new here", "Not a drink"], "…each row says what it knows");
  await pg.click('.scantick[data-i="1"]');
  p = await pick();
  eq([p.rows[1].startsWith("false"), p.go, await pg.evaluate(() => document.activeElement.dataset.i)], [true, "Log 1 cup", "1"], "a tick comes off, the count follows, and the keyboard stays on that row");
  await pg.click('.scantick[data-i="1"]');
  await save();
  s = await sheet();
  eq([s.of, s.save, s.on, s.price], ["Cup 1 of 2", "Save, next cup", ["Iced matcha latte 1"], "7.75"], "then the sheet, once for each cup");
  await save();
  s = await sheet();
  eq([s.of, s.save, s.on, s.price, s.same], ["Cup 2 of 2", "Save cup", ["Hojicha latte"], "7.00", "✓ From the receipt"], "…and a drink new here is on the sheet too");
  await save();
  const first = (await orders("Iced matcha latte")).pop(), second = (await orders("Hojicha latte")).pop();
  eq([first.date, first.p, second.date, second.ice, await pg.evaluate(() => $("dnsheet").hidden)], [earlier, "7.75", earlier, "Less ice", true], "both are saved on the receipt's date, and the sheet goes away after the last");

  /* More options keeps the rest of the receipt */
  await scan(["CORTADO 6.50", "HOJICHA LATTE 7.00", "TOTAL 15.00"]);
  await save();
  await pg.evaluate(() => qcMore());
  await pg.waitForFunction(() => [...document.querySelectorAll("#f-drinks .dn")].some(x => x.value === "Hojicha latte"));
  s = await pg.evaluate(() => [...document.querySelectorAll("#f-drinks .dn")].map(x => x.value).filter(Boolean));
  eq(s.includes("Cortado") && s.includes("Hojicha latte"), true, "More options opens the form with every cup of the receipt in it");
  await pg.evaluate(() => { _formSnap = formSnapshot(); show("list"); });

  /* a payment screen */
  await scan(["Total", "$8.50", "Add a tip", "15% $1.28", "20% $1.70", "No tip"]);
  s = await sheet();
  eq([s.from, s.on, s.save], ["This screen only shows a total, $8.50, with no drinks listed. Pick yours and check the price.", [], "Pick a drink"], "a payment screen says it only shows a total");
  await pg.click('#dns-panel .dntag:has-text("Cortado")');
  s = await sheet();
  eq([s.price, s.say], ["8.50", "The total on the screen. It may include tax, or more than one drink."], "…and picking a drink starts the price at that total");

  /* another currency */
  await scan(["CORTADO NT$120", "TOTAL NT$240"]);
  s = await sheet();
  eq([s.price, s.say], ["", "The receipt is in TWD, so the price is yours to fill in."], "a receipt in another currency leaves the price for you");

  /* can't read it */
  await scan(["~~ ;; 12", "34 56"]);
  s = await pg.evaluate(() => ({ title: $("dns-title").textContent, why: document.querySelector(".dnhead p").textContent, buttons: [...document.querySelectorAll("#dns-panel .dnact .btn")].map(x => x.textContent) }));
  eq(s, { title: "Couldn’t read that", why: "No drinks found in that part of the photo. Adjust the crop, or type it in.", buttons: ["Type it in", "Try again"] }, "a photo with no drinks in it says so and offers both ways on");
  await pg.click("#dns-panel .dnact .btn:last-child");
  eq(await pg.evaluate(() => [$("dns-title").textContent, !!$("scan-read")]), ["Where’s the receipt?", true], "…Try again goes back to the photo's box");
  await pg.click("#scan-all");
  await pg.waitForFunction(() => $("dns-title").textContent === "Couldn’t read that");
  await pg.click("#dns-panel .dnact .btn:first-child");
  s = await sheet();
  eq([s.title, s.from, s.scan], ["A cup at Sample Tea Bar", null, true], "…Type it in is the ordinary sheet");

  /* prices that don't add up */
  await scan(["CORTADO 3.25", "HOJICHA LATTE 7.00", "SUBTOTAL 12.25", "TOTAL 12.25"]);
  p = await pick();
  eq(p.foot, "These prices don’t add up to the receipt’s subtotal, so one may be misread.", "prices that do not add up to the subtotal are called out");
  await save();
  s = await sheet();
  eq(s.say, "Read from the receipt, but its prices don’t add up. Check this one.", "…on each cup's sheet too");

  /* Scan opens the camera (v136): the box for the receipt's text, there since v129, is gone */
  const ticket = [earlier, "Alex", "FOR HERE", "1 × Matcha Guava Cream", "Top (16oz)", "Lactose Free Whole", "Milk", "No Sweet"].join("\n");
  await reset();
  await pg.evaluate(() => openQuickCup());
  const [picker] = await Promise.all([pg.waitForEvent("filechooser"), pg.click("#dns-panel .qcscan")]);
  s = await pg.evaluate(() => ({ title: $("dns-title").textContent, box: !!$("scan-text"), sheet: !$("dnsheet").hidden, scan: _scan }));
  eq([picker.isMultiple(), s], [false, { title: "A cup at Sample Tea Bar", box: false, sheet: true, scan: null }], "Scan opens the camera for one photo, with no box for text first and the sheet you were on left as it was");
  /* text still reaches the app when it is shared to it, and is put right in the same place a photo's is */
  await pg.evaluate(() => _scanTextRun("12 34 ;;"));
  s = await pg.evaluate(() => document.querySelector(".dnhead p").textContent);
  eq(s, "No drinks found in that text. Check that it all came across, or type it in.", "text with no drinks in it says so");
  await pg.click("#dns-panel .dnact .btn:last-child");
  s = await pg.evaluate(() => ({ title: $("dns-title").textContent, text: $("scan-text").value, photo: !!document.querySelector("#dns-panel .scanthumb"), seg: !!document.querySelector("#dns-panel .scanseg"), buttons: [...document.querySelectorAll("#dns-panel .dnact .btn")].map(x => x.textContent) }));
  eq(s, { title: "Check what it read", text: "12 34 ;;", photo: false, seg: false, buttons: ["Take a photo", "Find the drinks"] }, "…and Try again brings the text back to fix, with no photo beside it and a photo offered");
  await pg.fill("#scan-text", ticket);
  await pg.click("#scan-go");
  eq(await pg.evaluate(() => [document.querySelectorAll("#dns-panel .scanrow").length, document.querySelectorAll("#dns-panel .scanthumb").length]), [1, 0], "text has no photo to show on the list");
  await one();
  s = await sheet();
  eq([s.title, s.on, s.same, s.spec, s.price, s.date.includes("Today")], ["A cup at Sample Tea Bar", ["Matcha Guava Cream Top"], "✓ From the receipt", "16 oz · lactose-free · no sugar", "", false],
     "an order ticket with no prices fills in the drink, its wrapped name, size, milk and sweetness, on the ticket's date");
  await save();
  saved = (await orders("Matcha Guava Cream Top")).pop();
  eq([saved.date, saved.size, saved.milk, saved.sweet, saved.p], [earlier, "16 oz", "Lactose-free", "0%", undefined], "…and saves it with no price, since the ticket had none");
  await pg.evaluate(() => closeSheet());

  /* Log with no cafe open: Add a visit has Scan too */
  const fromLog = async lines => {
    await pg.evaluate(() => { if (app.dataset.view === "form") _formSnap = formSnapshot(); });
    await reset();
    await pg.evaluate(t => { userLoc = null; show("list"); window.__text = t; logTab(); $("f-name").value = "New Place Coffee"; nameTyped(); }, lines.join("\n"));
    await shoot(file());
    await pg.waitForFunction(() => !document.querySelector(".scanr") || $("dnsheet").hidden);
    await one();
  };
  const form = () => pg.evaluate(() => ({ view: app.dataset.view, name: $("f-name").value, sheet: !$("dnsheet").hidden, saved: cafes.length,
    rows: [...document.querySelectorAll("#f-drinks .dr")].map(r => r.querySelector(".dn").value + " " + r.querySelector(".dp").value) }));
  await pg.evaluate(() => { if (app.dataset.view === "form") _formSnap = formSnapshot(); });
  await reset();
  s = await pg.evaluate(() => { userLoc = null; show("list"); logTab(); return { view: app.dataset.view, shown: !$("f-scan").hidden }; });
  eq(s, { view: "form", shown: false }, "Log with no cafe open goes to Add a visit, where Scan waits for the cafe's name");
  await pg.fill("#f-name", "New Place Coffee");
  s = await pg.evaluate(() => { const r = $("f-scan").getBoundingClientRect(), t = $("form-title").getBoundingClientRect(); return { shown: !$("f-scan").hidden, tall: r.height >= 44, right: r.right <= innerWidth - 8, oneLine: t.height < 40 }; });
  eq(s, { shown: true, tall: true, right: true, oneLine: true }, "…and shows in the header once there is one");
  await pg.fill("#f-name", "");
  eq(await pg.evaluate(() => $("f-scan").hidden), true, "…and goes again if the name is cleared");
  await pg.evaluate(() => { _formSnap = formSnapshot(); });
  await fromLog(["NEW PLACE COFFEE", "12 OAK ST", "CORTADO 6.50", "TOTAL 7.00"]);
  eq(await form(), { view: "form", name: "New Place Coffee", sheet: false, saved: 1, rows: ["Cortado 6.50"] }, "a receipt scanned from Add a visit adds a row for the cup, the blank row gone, the name as you typed it, nothing saved");
  await fromLog(["NEW PLACE COFFEE", "ICD MTCHA LT 6.75", "HOJI LT 7.00", "CROISSANT 5.00", "TOTAL 18.75"]);
  p = await pick();
  eq(p.go, "Log 2 cups", "several items ask which were yours here too");
  s = await pg.evaluate(() => document.querySelector(".dnhead p").textContent.startsWith("New Place Coffee · "));
  eq(s, true, "…under the name you typed");
  await save();
  s = await form();
  eq([s.view, s.name, s.rows], ["form", "New Place Coffee", ["Iced matcha latte 6.75", "Hojicha latte 7.00"]], "…and each cup becomes a row of the form");
  await fromLog(["~~ ;; 12"]);
  await pg.click("#dns-panel .dnact .btn:first-child");
  s = await form();
  eq([s.view, s.sheet], ["form", false], "Type it in from the form goes back to the form");
  await pg.evaluate(() => { _formSnap = formSnapshot(); });
  await reset();
  await pg.evaluate(() => { userLoc = null; show("list"); logTab(); });
  await pg.fill("#f-name", "New Place Coffee");
  await pg.evaluate(t => _scanTextRun(t), ticket);
  await one();
  s = await form();
  eq([s.view, s.name, s.rows, s.sheet], ["form", "New Place Coffee", ["Matcha Guava Cream Top "], false], "a ticket's text read from Add a visit adds the drink and leaves the cafe's name as you typed it");

  /* always a way out */
  await pg.evaluate(() => { _formSnap = formSnapshot(); });
  await scan(["~~ ;; 12"]);
  await pg.click("#dns-panel .ocx");
  s = await pg.evaluate(() => ({ view: app.dataset.view, hidden: $("dnsheet").hidden, scan: _scan === null }));
  eq(s, { view: "detail", hidden: true, scan: true }, "a failed scan has a close button that goes back to where you were");
  await scan(["Cortado 5.00", "Drip 2.00", "TOTAL 7.00"]);
  await pg.click("#dns-panel .ocx");
  eq(await pg.evaluate(() => $("dnsheet").hidden), true, "…and so does the list to tick");
  await scan(["~~ ;; 12"]);
  await pg.evaluate(() => window.dispatchEvent(new PopStateEvent("popstate")));
  s = await pg.evaluate(() => ({ view: app.dataset.view, hidden: $("dnsheet").hidden }));
  eq(s, { view: "detail", hidden: true }, "the phone's back gesture puts the sheet away instead of leaving it on top");

  /* a layout the rules do not know: tap your drink's line (v133) */
  await scan(["ORDER 0417", "Yuzu Sparkle", "Light ice", "PAID 7.50", "Thank you"]);
  s = await pg.evaluate(() => ({ title: $("dns-title").textContent, why: document.querySelector(".dnhead p").textContent, lines: [...document.querySelectorAll(".scanln")].map(x => x.textContent),
    go: $("scan-log").textContent + ($("scan-log").disabled ? " off" : ""), photo: !!document.querySelector("#dns-panel .scanthumb img"), close: !!document.querySelector("#dns-panel .ocx"),
    tall: [...document.querySelectorAll(".scanln")].every(x => x.getBoundingClientRect().height >= 44), wide: document.documentElement.scrollWidth <= innerWidth }));
  eq(s, { title: "Which line is your drink?", why: "It couldn’t find a drink in this layout. Tap the line that names yours.", lines: ["ORDER 0417", "Yuzu Sparkle", "Light ice", "PAID 7.50", "Thank you"],
          go: "Tap a line off", photo: true, close: true, tall: true, wide: true }, "a layout the rules do not know lists the text's lines to tap, under your photo");
  await pg.click('.scanln[data-i="3"]');
  eq(await pg.evaluate(() => [$("scan-linename").value, _scan.items[0].price]), ["Paid", 7.5], "a tapped line that ends in a price brings the price");
  await pg.click('.scanln[data-i="1"]');
  s = await pg.evaluate(() => ({ on: [...document.querySelectorAll('.scanln[aria-pressed="true"]')].map(x => x.textContent), name: $("scan-linename").value, go: $("scan-log").textContent + ($("scan-log").disabled ? " off" : ""), ice: _scan.items[0].ice }));
  eq(s, { on: ["Yuzu Sparkle"], name: "Yuzu Sparkle", go: "Log 1 cup", ice: "Less ice" }, "tapping a line makes it the drink, with how it was made from the line under it");
  await pg.fill("#scan-linename", "Yuzu sparkle soda");
  await pg.click("#scan-log");
  s = await sheet();
  eq([s.on, s.same, s.spec], [["Yuzu sparkle soda"], "✓ From the receipt", "less ice"], "…and the name, put right in its box, goes on to the sheet");
  await save();
  eq((await orders("Yuzu sparkle soda")).map(o => o.ice), ["Less ice"], "…and is saved");
  await scan(["Cortado 5.00", "Drip 2.00", "TOTAL 7.00"]);
  await pg.click("#dns-panel .scanalt");
  s = await pg.evaluate(() => [$("dns-title").textContent, document.querySelector(".dnhead p").textContent, document.querySelectorAll(".scanln").length]);
  eq(s, ["Which line is your drink?", "Tap the line that names your drink.", 3], "the list offers the same: My drink isn’t here");
  await pg.fill("#scan-linename", "Mystery drink");
  eq(await pg.evaluate(() => $("scan-log").textContent + ($("scan-log").disabled ? " off" : "")), "Log 1 cup", "…and a name can be typed outright, with no line tapped");
  eq(await pg.evaluate(() => document.querySelector("#dns-panel .dnact .btn").textContent), "Back to the list", "…and from there the way back is to the list");
  await pg.click("#dns-panel .dnact .btn:first-child");
  eq(await pg.evaluate(() => [$("dns-title").textContent, document.querySelectorAll("#dns-panel .scanrow").length]), ["Which ones were yours?", 2], "…which is as it was");
  await pg.evaluate(() => closeSheet());

  /* the cut is yours to make (v135): every photo stops at a box over it. A leaning paper on a dark counter */
  const shot = await pg.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 1500; c.height = 2000;
    const g = c.getContext("2d"); g.fillStyle = "#2e261f"; g.fillRect(0, 0, 1500, 2000);
    g.translate(700, 1100); g.rotate((8 * Math.PI) / 180);
    g.fillStyle = "#f3f0e9"; g.fillRect(-300, -450, 600, 900);
    g.fillStyle = "#222"; g.font = "bold 40px 'Courier New', monospace";
    ["SAMPLE TEA BAR", "", "CORTADO     6.50", "", "TOTAL       6.50"].forEach((t, i) => g.fillText(t, -250, -300 + i * 70));
    return c.toDataURL("image/png").split(",")[1];
  });
  const shotFile = () => ({ name: "s.png", mimeType: "image/png", buffer: Buffer.from(shot, "base64") });
  /* the paper's own corners, as fractions of the photo, clockwise from the top left */
  const paper = [[-300, -450], [300, -450], [300, 450], [-300, 450]].map(([u, v]) => { const a = (8 * Math.PI) / 180; return [(700 + u * Math.cos(a) - v * Math.sin(a)) / 1500, (1100 + u * Math.sin(a) + v * Math.cos(a)) / 2000]; });
  /* the reader stands in, and keeps what it was shown; with `doubt` it answers as the real one does, with the words it was unsure of */
  const readsAs = (text, fail, doubt) => pg.evaluate(a => {
    window.__seen = [];
    scanRead = image => { window.__seen.push({ w: image.width, h: image.height, img: image }); return a.fail ? Promise.reject(new Error("no")) : Promise.resolve(a.doubt ? { text: a.text, doubt: a.doubt } : a.text); };
  }, { text, fail: !!fail, doubt: doubt || null });
  const listed = () => pg.waitForFunction(() => { const i = document.querySelector("#dns-panel .scanthumb img"); return !document.querySelector(".scanr") && document.querySelector("#dns-panel .scanrow") && i && i.complete && i.naturalWidth > 0; });
  const box = () => pg.evaluate(() => {
    const img = $("scan-cropimg").getBoundingClientRect(), hd = [...document.querySelectorAll(".scanhd")].map(h => h.getBoundingClientRect());
    return { title: $("dns-title").textContent, say: document.querySelector(".dnhead p").textContent, quad: _scan.pic.quad, guess: _scan.pic.guess,
             /* each corner's button sits on its corner of the box */
             on: hd.every((r, i) => Math.abs(r.left + r.width / 2 - (img.left + _scan.pic.quad[i][0] * img.width)) < 1.5 && Math.abs(r.top + r.height / 2 - (img.top + _scan.pic.quad[i][1] * img.height)) < 1.5),
             tap: hd.every(r => r.width >= 44 && r.height >= 44), names: [...document.querySelectorAll(".scanhd")].map(h => h.getAttribute("aria-label")),
             edge: $("scan-edge").getAttribute("points").split(" ").length, buttons: [...document.querySelectorAll("#dns-panel .dnact .btn, #dns-panel .scanalt")].map(x => x.textContent),
             reads: window.__seen.length, loupe: !$("scan-loupe").hidden, big: img.width > innerWidth * 0.8, reach: $("scan-read").getBoundingClientRect().bottom <= innerHeight, wide: document.documentElement.scrollWidth <= innerWidth };
  });
  const far = (q, want) => Math.max(...q.map((p, i) => Math.hypot((p[0] - want[i][0]) * 1500, (p[1] - want[i][1]) * 2000)));
  const centre = i => pg.evaluate(i => { const r = document.querySelector('.scanhd[data-i="' + i + '"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, i);
  await reset();
  await readsAs("CORTADO 6.50\nTOTAL 6.50");
  await pg.evaluate(() => openQuickCup());
  await shoot(shotFile(), "stay");
  let bx = await box();
  eq([bx.title, bx.say, bx.buttons, bx.reads, bx.guess], ["Where’s the receipt?", "Drag the corners until the box fits it.", ["Whole photo", "Read this part", "Retake"], 0, true],
     "a photo stops at a box over it, and nothing is read until you say which part is the receipt (v135)");
  eq([bx.on, bx.tap, bx.names, bx.edge, bx.loupe, bx.big, bx.reach, bx.wide], [true, true, ["Top left corner", "Top right corner", "Bottom right corner", "Bottom left corner"], 8, false, true, true, true],
     "…with a 44px corner to drag at each corner of the box, named, the photo nearly as wide as the phone, and Read this part in reach");
  eq(far(bx.quad, paper) < 75, true, "…and the box starts on the receipt it found, leaning as it leans, a margin out (" + Math.round(far(bx.quad, paper)) + "px off at most, of 1500)");

  /* drag each corner onto the paper's own corner */
  const img0 = await pg.evaluate(() => { const r = $("scan-cropimg").getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  for (let i = 0; i < 4; i++) {
    const from = await centre(i);
    await pg.mouse.move(from[0] + 6, from[1] - 5);
    await pg.mouse.down();
    await pg.mouse.move(img0[0] + paper[i][0] * img0[2] + 6, img0[1] + paper[i][1] * img0[3] - 5, { steps: 5 });
    if (i === 0) {
      s = await pg.evaluate(() => { const l = $("scan-loupe"), g = l.getContext("2d"), d = g.getImageData(0, 0, l.width, l.height).data; let lit = 0, dark = 0; for (let p = 0; p < d.length; p += 4) { if (d[p] > 200) lit++; else if (d[p] < 80) dark++; }
        const r = l.getBoundingClientRect(), i = $("scan-cropimg").getBoundingClientRect(), h = document.querySelector('.scanhd[data-i="0"]').getBoundingClientRect();
        return { shown: !l.hidden, both: lit > 2000 && dark > 2000, inside: r.left >= i.left && r.right <= i.right && r.top >= i.top, clear: r.left > h.right || r.right < h.left || r.bottom < h.top || r.top > h.bottom }; });
      eq(s, { shown: true, both: true, inside: true, clear: true }, "while a corner is dragged a magnifier shows the photo under the finger, paper and counter both, clear of the finger");
    }
    await pg.mouse.up();
  }
  bx = await box();
  eq([far(bx.quad, paper) < 6, bx.on, bx.loupe, bx.reads], [true, true, false, 0], "each corner goes where it is dragged, from wherever on it the finger took hold, and the magnifier goes when it is let go (" + far(bx.quad, paper).toFixed(1) + "px off)");
  /* a corner cannot cross its neighbour, or leave the photo */
  let from = await centre(0);
  const other = await centre(1);
  await pg.mouse.move(from[0], from[1]); await pg.mouse.down(); await pg.mouse.move(other[0] + 60, other[1], { steps: 6 }); await pg.mouse.up();
  let q2 = (await box()).quad;
  eq([q2[0][0] < q2[1][0], await pg.evaluate(() => quadOk(_scanQuadPx(_scan.pic, _scan.pic.quad), 1))], [true, true], "a corner dragged past its neighbour stops short: the box stays a box");
  from = await centre(3);
  await pg.mouse.move(from[0], from[1]); await pg.mouse.down(); await pg.mouse.move(-40, 2000, { steps: 4 }); await pg.mouse.up();
  q2 = (await box()).quad;
  eq([q2[3][0] >= 0, q2[3][1] <= 1], [true, true], "…and one dragged off the photo stops at its edge");
  /* the keyboard moves a corner too */
  await pg.evaluate(q => { _scan.pic.quad = q; _scanCropDraw(); }, paper);
  await pg.focus('.scanhd[data-i="2"]');
  await pg.keyboard.press("ArrowRight"); await pg.keyboard.press("ArrowDown"); await pg.keyboard.press("Shift+ArrowLeft");
  q2 = (await box()).quad;
  eq([+(q2[2][0] - paper[2][0]).toFixed(3), +(q2[2][1] - paper[2][1]).toFixed(3)], [-0.025, 0.005], "the arrow keys move a corner a little, and with Shift a lot");
  await pg.evaluate(q => { _scan.pic.quad = q; _scanCropDraw(); }, paper);

  await pg.click("#scan-read");
  await listed();
  s = await pg.evaluate(() => {
    const c = window.__seen[0], g = c.img.getContext("2d"), d = g.getImageData(0, 0, c.w, c.h).data, at = (x, y) => d[(Math.round(c.h * y) * c.w + Math.round(c.w * x)) * 4];
    let grey = true; for (let p = 0; p < d.length; p += 4 * 97) if (d[p] !== d[p + 1] || d[p + 1] !== d[p + 2]) grey = false;
    const seg = [...document.querySelectorAll(".scanseg button")], shown = $("scan-thumbimg");
    return { title: $("dns-title").textContent, box: !!$("scan-text"), back: document.querySelector("#dns-panel .dnact .btn").textContent, alt: shown.alt, reads: window.__seen.length,
             rows: [...document.querySelectorAll(".scanrow")].map(x => x.querySelector(".scantick").getAttribute("aria-pressed") + " " + x.querySelector(".scanname").value + " " + (v => (v ? "$" + v : ""))(x.querySelector(".scanprice").value)),
             size: Math.abs(c.w - 600) < 8 && Math.abs(c.h - 900) < 8, grey: grey, paper: [at(0.02, 0.02), at(0.98, 0.02), at(0.02, 0.98), at(0.97, 0.97), at(0.5, 0.01), at(0.01, 0.5)].every(v => v > 200),
             seg: seg.map(b => b.textContent + " " + b.getAttribute("aria-pressed")), cleaned: shown.src === _scan.url && !!_scan.orig && _scan.orig !== _scan.url, tall: seg.every(b => b.getBoundingClientRect().height >= 44),
             under: seg[0].getBoundingClientRect().top >= shown.getBoundingClientRect().bottom - 1 && seg[0].getBoundingClientRect().bottom <= document.querySelector(".scanlist").getBoundingClientRect().top, wide: document.documentElement.scrollWidth <= innerWidth };
  });
  eq(s, { title: "Is this yours?", box: false, back: "Adjust crop", alt: "Your receipt, cut out of your photo", reads: 1, rows: ["true Cortado $6.50"], size: true, grey: true, paper: true,
          seg: ["Cleaned up true", "Original false"], cleaned: true, tall: true, under: true, wide: true },
     "Read this part hands the reader what is inside the box, pulled flat and cleaned up, grey with paper to every edge, and goes on to the drinks it found, under that picture and its switch");
  /* the picture switch, on the list now (v138; beside the text in v136) */
  await pg.fill("#dns-panel .scanname", "Cortado doppio");
  await pg.click('.scanseg button[data-v="orig"]');
  s = await pg.evaluate(() => ({ seg: [...document.querySelectorAll(".scanseg button")].map(b => b.getAttribute("aria-pressed")), shown: $("scan-thumbimg").src === _scan.orig, name: document.querySelector(".scanname").value, reads: window.__seen.length }));
  eq(s, { seg: ["false", "true"], shown: true, name: "Cortado doppio", reads: 1 }, "Original shows the part as you took it, with nothing read again and the name you put right still there");
  /* back to the box and on again, the box left as it was: nothing is read twice */
  await pg.click("#dns-panel .dnact .btn:first-child");
  bx = await box();
  eq([bx.title, far(bx.quad, paper) < 0.01, bx.reads], ["Where’s the receipt?", true, 1], "Adjust crop goes back to the box, where it was left");
  await pg.click("#scan-read");
  await listed();
  eq(await pg.evaluate(() => [$("dns-title").textContent, window.__seen.length, $("scan-thumbimg").src === _scan.orig]), ["Is this yours?", 1, true], "…and a box left as it was is not read again, the picture you chose still the one shown");
  /* a box that was moved is read again */
  await pg.click("#dns-panel .dnact .btn:first-child");
  await pg.focus('.scanhd[data-i="0"]');
  await pg.keyboard.press("Shift+ArrowLeft");
  await pg.click("#scan-read");
  await listed();
  s = await pg.evaluate(() => [window.__seen.length, window.__seen[1].w > 600, document.querySelector(".scanseg button").getAttribute("aria-pressed")]);
  eq(s, [2, true, "true"], "…and a box that was moved is read again, the wider part this time, shown cleaned up");
  /* the lines of the text, from the list and back to it */
  await pg.click("#dns-panel .scanalt");
  eq(await pg.evaluate(() => [$("dns-title").textContent, document.querySelector("#dns-panel .dnact .btn").textContent, !!document.querySelector("#dns-panel .scanthumb img"), !!document.querySelector("#dns-panel .scanseg")]),
     ["Which line is your drink?", "Back to the list", true, true], "My drink isn’t here keeps the picture and its switch above the lines");
  await pg.click("#dns-panel .dnact .btn:first-child");
  eq(await pg.evaluate(() => [$("dns-title").textContent, document.querySelector(".scanname").value]), ["Is this yours?", "Cortado"], "…and goes back to the list");
  await pg.evaluate(() => closeSheet());
  eq(await pg.evaluate(() => _scan), null, "closing lets the reading and its pictures go");

  /* what the reader doubted, under the drink it is about (v138; chips under the text in v136) */
  await reset();
  await readsAs("CORTADO 6.50\nFlat Whlte 6.95\nTOTAL 13.45", false, ["Whlte", "6.95"]);
  await pg.evaluate(() => openQuickCup());
  await shoot(shotFile(), "box");
  await listed();
  s = await pg.evaluate(() => [...document.querySelectorAll(".scanrow")].map(x => (v => (v ? "$" + v : ""))(x.querySelector(".scanprice").value) + " " + ((x.querySelector(".scanunsure") || {}).textContent || "sure")));
  eq(s, ["$6.50 sure", "$6.95 The reader wasn’t sure of “Whlte” or the price."], "a word or a price the reader was unsure of is said under the drink it is about, and not under the others");
  eq(await pg.evaluate(() => { const u = document.querySelector(".scanunsure"), r = u.closest(".scanrow"); return u.getBoundingClientRect().bottom <= r.getBoundingClientRect().bottom + 1 && document.documentElement.scrollWidth <= innerWidth; }), true, "…inside its row");
  await pg.evaluate(() => closeSheet());

  /* a drink the reader doubted gets its second look, which is kept when it is sure of more (v139) */
  const looksAs = (first, second) => pg.evaluate(a => { window.__seen = []; scanRead = image => { window.__seen.push(image.width); return Promise.resolve(window.__seen.length === 1 ? a.first : a.second); }; }, { first, second });
  const rowsNow = () => pg.evaluate(() => ({ rows: [...document.querySelectorAll(".scanrow")].map(x => x.querySelector(".scantick").getAttribute("aria-pressed") + " " + x.querySelector(".scanname").value + " " + (v => (v ? "$" + v : ""))(x.querySelector(".scanprice").value) + (x.querySelector(".scanunsure") ? " ?" : "")), looks: window.__seen.length }));
  await reset();
  await looksAs({ text: "Xqzv 6.28\nTOTAL 6.28", doubt: ["Xqzv", "6.28"] }, { text: "CORTADO 6.25\nTOTAL 6.25", doubt: [] });
  await pg.evaluate(() => openQuickCup());
  await shoot(shotFile(), "box");
  await listed();
  eq(await rowsNow(), { rows: ["true Cortado $6.25"], looks: 2 }, "a first look that doubts its drink gets the second look, and the second is kept when it is sure of more: a misread name and price come out right");
  await reset();
  await looksAs({ text: "CORTADO 6.50\nXqzv 6.28\nTOTAL 12.78", doubt: ["Xqzv"] }, { text: "CORTADO 6.50\nTOTAL 6.50", doubt: [] });
  await pg.evaluate(() => openQuickCup());
  await shoot(shotFile(), "box");
  await listed();
  eq(await rowsNow(), { rows: ["true Cortado $6.50", "false Xqzv $6.28 ?"], looks: 2 }, "…and the first stands when the second is sure of no more, so a doubted line is shown with its doubt, unticked, and not dropped");
  await reset();
  await looksAs({ text: "CORTADO 6.50\nTOTAL 6.50", doubt: [] }, { text: "never", doubt: [] });
  await pg.evaluate(() => openQuickCup());
  await shoot(shotFile(), "box");
  await listed();
  eq(await rowsNow(), { rows: ["true Cortado $6.50"], looks: 1 }, "…and a first look with nothing doubted is the only look");
  await pg.evaluate(() => closeSheet());

  /* Whole photo, said at the box, reads all of it */
  await reset();
  await readsAs("CORTADO 6.50\nTOTAL 6.50");
  await pg.evaluate(() => openQuickCup());
  await shoot(shotFile());
  await listed();
  s = await pg.evaluate(() => [window.__seen[0].w, window.__seen[0].h, $("scan-thumbimg").alt, document.querySelector("#dns-panel .dnact .btn").textContent]);
  eq(s, [1500, 2000, "Your photo", "Adjust crop"], "Whole photo reads the photo as it was taken, and the box is still a tap away");
  await pg.evaluate(() => closeSheet());

  /* a part with no words in it, or a reader that fails: back to the box, not to the start */
  await reset();
  await readsAs("  \n ");
  await pg.evaluate(() => openQuickCup());
  await shoot(shotFile(), "box");
  await pg.waitForFunction(() => $("dns-title").textContent === "Couldn’t read that");
  await pg.click("#dns-panel .dnact .btn:last-child");
  bx = await box();
  eq([bx.title, bx.guess, bx.buttons], ["Where’s the receipt?", true, ["Whole photo", "Read this part", "Retake"]], "a part that would not read goes back to its box on Try again: move it, read the whole photo, or retake");
  await readsAs("CORTADO 6.50\nTOTAL 6.50");
  await pg.click("#scan-read");
  await listed();
  eq(await pg.evaluate(() => [document.querySelector(".scanname").value, window.__seen.length]), ["Cortado", 1], "…and the same box is read again then, since the first reading came to nothing");
  await pg.evaluate(() => closeSheet());

  /* nothing in the photo is plainly a receipt: the box starts a little in from its edges */
  await reset();
  await readsAs("CORTADO 6.50\nTOTAL 6.50");
  await pg.evaluate(() => openQuickCup());
  await shoot(file(), "stay");
  bx = await box();
  eq([bx.guess, bx.say, bx.quad, bx.on], [false, "Drag the corners onto the receipt’s corners.", [[0.08, 0.08], [0.92, 0.08], [0.92, 0.92], [0.08, 0.92]], true], "with no receipt to find, the box starts a little in from the photo's edges and says what to do");
  await pg.click("#dns-panel .scanalt");
  eq(await pg.evaluate(() => $("dns-title").textContent), "Where’s the receipt?", "Retake opens the camera again, the box staying until there is a new photo");
  await pg.evaluate(() => { closeSheet(); scanRead = window.__stub; });

  /* the box says when the receipt is too small in the photo to read (v140) */
  await reset();
  await readsAs("CORTADO 6.50\nTOTAL 6.50");
  await pg.evaluate(() => openQuickCup());
  await shoot(shotFile(), "stay");
  const acts = () => pg.evaluate(() => ({ warn: $("scan-small") ? $("scan-small").textContent : "", buttons: [...document.querySelectorAll("#scan-cropacts .dnact .btn, #scan-cropacts .scanalt")].map(x => x.textContent + (x.id ? " #" + x.id : "")),
    tall: [...document.querySelectorAll("#scan-cropacts button")].every(x => x.getBoundingClientRect().height >= 44), reach: $("scan-read").getBoundingClientRect().bottom <= innerHeight, wide: document.documentElement.scrollWidth <= innerWidth }));
  eq(await acts(), { warn: "", buttons: ["Whole photo #scan-all", "Read this part #scan-read", "Retake"], tall: true, reach: true, wide: true }, "a box big enough to read offers what it always did");
  /* the box drawn down to a fifth of the photo's width: 300 of its 1500 pixels */
  await pg.evaluate(() => { _scan.pic.quad = [[0.4, 0.4], [0.6, 0.4], [0.6, 0.62], [0.4, 0.62]]; _scanCropDraw(); });
  eq(await acts(), { warn: "The receipt is small in this photo, so its print may not read. Move closer and retake.", buttons: ["Read anyway #scan-read", "Retake #scan-again", "Whole photo #scan-all"], tall: true, reach: true, wide: true },
     "a box too small in the photo for its print to read says so before anything is read, with Retake first and reading it still a choice");
  eq(await pg.evaluate(() => $("scan-small").getAttribute("role")), "status", "…said for a screen reader as it appears");
  await pg.focus('.scanhd[data-i="2"]');
  for (let i = 0; i < 4; i++) await pg.keyboard.press("Shift+ArrowRight");
  eq([(await acts()).warn, await pg.evaluate(() => document.activeElement.className)], ["", "scanhd"], "…and goes as a corner is drawn out again, the corner still in hand");
  await pg.evaluate(() => { _scan.pic.quad = [[0.4, 0.4], [0.6, 0.4], [0.6, 0.62], [0.4, 0.62]]; _scanCropDraw(); });
  await pg.click("#scan-read");
  await listed();
  eq(await pg.evaluate(() => [window.__seen.length, window.__seen[0].w < 380]), [1, true], "Read anyway reads the small box all the same");
  await pg.evaluate(() => closeSheet());

  /* the list is one you can finish on (v140): the price is a box */
  await reset();
  await readsAs("CORTADO 6.95\nYuzu Fizz 7.00\nTOTAL 13.95");
  await pg.evaluate(() => openQuickCup());
  await shoot(shotFile(), "box");
  await listed();
  s = await pg.evaluate(() => { const r = [...document.querySelectorAll(".scanrow")], p = r[0].querySelector(".scanprice"), b = p.getBoundingClientRect(), row = r[0].getBoundingClientRect();
    return { rows: r.map(x => x.querySelector(".scantick").getAttribute("aria-pressed") + " " + x.querySelector(".scanname").value + " " + x.querySelector(".scanp").textContent + x.querySelector(".scanprice").value + " " + x.querySelector(".scannote").textContent),
             label: p.getAttribute("aria-label"), keys: p.getAttribute("inputmode"), tall: b.height >= 44, inside: b.right <= row.right + 1, whole: r.every(x => x.getBoundingClientRect().bottom <= document.querySelector(".scanlist").getBoundingClientRect().bottom + 1), size: parseFloat(getComputedStyle(p).fontSize) >= 16, wide: document.documentElement.scrollWidth <= innerWidth }; });
  eq(s, { rows: ["true Cortado $6.95 had 2× here", "true Yuzu Fizz $7.00 new here"], label: "Price", keys: "decimal", tall: true, inside: true, whole: true, size: true, wide: true },
     "each price is a box of its own, 44px and 16px type, inside its row; a priced drink it has not seen is ticked and called new here; and every row is all there, the sheet scrolling when the list is long");
  await pg.fill('.scanprice[data-i="0"]', "6,25");
  eq(await pg.evaluate(() => [_scan.items[0].price, document.activeElement.className, $("scan-log").textContent]), [6.25, "scanprice", "Log 2 cups"], "a price put right there is the price, a comma read as its decimal point, the cursor staying in the box");
  await pg.fill('.scanprice[data-i="1"]', "");
  eq(await pg.evaluate(() => _scan.items[1].price), null, "…and an emptied box is no price, to fill in on the sheet");
  await pg.click('.scantick[data-i="1"]');
  await pg.click("#scan-log");
  s = await sheet();
  eq([s.on, s.price], [["Cortado 2"], "6.25"], "…and the price you put right is the one on the sheet");
  await pg.evaluate(() => closeSheet());
  /* a line with no price that names no drink is still only a maybe */
  await reset();
  await pg.evaluate(() => _scanTextRun("1 x Yuzu Fizz\n1 x Cortado"));
  eq(await pg.evaluate(() => [...document.querySelectorAll(".scanrow")].map(x => x.querySelector(".scantick").getAttribute("aria-pressed") + " " + x.querySelector(".scanname").value + " " + x.querySelector(".scannote").textContent)),
     ["false Yuzu Fizz Not sure it’s a drink", "true Cortado had 2× here"], "a line with no price that names no drink it knows is still left for you to tick");
  eq(await pg.evaluate(() => !!$("scan-keep")), false, "…and text shared to the app has no photo to keep");
  await pg.evaluate(() => closeSheet());

  /* a reading that went wrong can be kept on the phone, photo and all, and shared later (v140) */
  await pg.evaluate(() => caches.delete("cafemap-kept"));
  await reset();
  await readsAs("Xqzv 6.28\nTOTAL 6.28", false, ["Xqzv"]);
  await pg.evaluate(() => openQuickCup());
  await shoot(shotFile(), "box");
  await listed();
  eq(await pg.evaluate(() => [$("scan-keep").textContent, !!$("scan-keptn"), $("scan-keep").getBoundingClientRect().height >= 44, $("scan-keep").getBoundingClientRect().bottom <= document.querySelector("#dns-panel .dnact").getBoundingClientRect().top + 1]),
     ["Read it wrong? Keep this photo for testing", false, true, true], "the list offers to keep a reading that went wrong, above its buttons");
  await pg.click("#scan-keep");
  await pg.waitForFunction(() => !!$("scan-keptn"));
  s = await pg.evaluate(async () => {
    const c = await caches.open("cafemap-kept"), keys = (await c.keys()).map(k => k.url.replace(/.*__kept\/\d+/, "")).sort();
    const id = (/__kept\/(\d+)/.exec((await c.keys())[0].url) || [])[1];
    const photo = await (await c.match("__kept/" + id + ".photo")).blob(), note = JSON.parse(await (await c.match("__kept/" + id + ".txt")).text());
    return { keys, photo: [photo.type, photo.size > 10000], app: /^v\d+$/.test(note.app), size: note.photo, box: Array.isArray(note.box) && note.box.length === 4, read: note.read, unsure: note.unsure, drinks: note.drinks,
             says: $("scan-keptn").textContent, keep: !!$("scan-keep"), toast: $("toast").textContent, links: [...document.querySelectorAll("#scan-kept .scankeptn button")].map(b => b.textContent + " " + (b.getBoundingClientRect().height >= 44)) };
  });
  eq(s, { keys: [".photo", ".txt"], photo: ["image/png", true], app: true, size: "1500x2000", box: true, read: "Xqzv 6.28\nTOTAL 6.28", unsure: ["Xqzv"], drinks: [{ name: "Xqzv", price: 6.28, ticked: false, printed: "Xqzv" }],
          says: "1 kept for testing", keep: false, toast: "Kept on this phone", links: ["Share true", "Clear true"] },
     "Keep stores the photo as it was taken and, beside it, what the app made of it: the box, the text, what was doubted and the drinks, on the phone alone");
  eq(await pg.evaluate(async () => { const reg = await navigator.serviceWorker.ready, sw = await (await fetch(reg.active.scriptURL)).text(); /* as written, and as the built site has it, shortened */ return /!==\s*KEPT_CACHE\b/.test(sw) && /KEPT_CACHE\s*=\s*"cafemap-kept"/.test(sw); }), true, "…in a cache the app's updates do not clear");
  s = await pg.evaluate(async () => {
    window.__shared = null;
    Object.defineProperty(navigator, "canShare", { configurable: true, value: d => !!(d && d.files && d.files.length) });
    Object.defineProperty(navigator, "share", { configurable: true, value: async d => { window.__shared = d.files.map(f => f.name.replace(/\d+/, "N") + " " + f.type); } });
    $("scan-keptshare").click();
    for (let i = 0; i < 50 && !window.__shared; i++) await new Promise(ok => setTimeout(ok, 40));
    return { shared: window.__shared, still: (await (await caches.open("cafemap-kept")).keys()).length };
  });
  eq(s, { shared: ["scan-N.png image/png", "scan-N.txt text/plain"], still: 2 }, "Share hands each photo and its note to the phone's share sheet, and they stay kept until cleared");
  await pg.click("#scan-keptclear");
  await pg.waitForFunction(() => !$("scan-keptn") && !!$("scan-keep"));
  eq(await pg.evaluate(async () => [(await caches.keys()).includes("cafemap-kept"), $("toast").textContent]), [false, "Kept photos cleared"], "Clear lets them go, and the reading can be kept again");
  await pg.evaluate(() => closeSheet());


  /* the receipt's picture stays in view while its drinks are put right (v140): "can we keep the image throughout the
     receipt editing process of the drinks like rename drinks and change price for reference" */
  const picAt = at => pg.evaluate(async at => {
    const i = document.querySelector(at + " .scanthumb img");
    if (!i) return null;
    for (let k = 0; k < 60 && !i.complete; k++) await new Promise(ok => setTimeout(ok, 50));
    return { loads: i.complete && i.naturalWidth > 0, pinned: getComputedStyle(i.closest(".scanthumb")).position, shows: (document.querySelector(at + " .scanseg .on") || {}).textContent || "" };
  }, at);
  const five = async () => {
    await readsAs("CORTADO 6.50\nHOJICHA LATTE 7.00\nYUZU FIZZ 6.00\nMATCHA LATTE 7.50\nFLAT WHITE 5.00\nTOTAL 32.00");
    await shoot(shotFile(), "box");
    await listed();
  };
  await reset();
  await pg.evaluate(() => openQuickCup());
  eq(await pg.evaluate(() => !!document.querySelector("#dns-panel .scanthumb")), false, "a cup that came from no receipt has no picture");
  await five();
  s = await pg.evaluate(() => {
    const d = $("dns-panel"), th = d.querySelector(".scanthumb");
    d.scrollTo(0, 99999);
    const far = d.scrollTop, pinned = Math.abs(th.getBoundingClientRect().top - d.getBoundingClientRect().top) < 2;
    /* the first name is under the picture by now, or past it: taking it in hand brings it back, to below the picture */
    d.querySelector(".scanname").focus();
    const a = th.getBoundingClientRect(), b = document.activeElement.getBoundingClientRect(), p = d.getBoundingClientRect();
    return { rows: d.querySelectorAll(".scanrow").length, scrolls: far > 0, pinned: pinned, whole: a.height > 60, below: b.top >= a.bottom - 1 && a.top >= p.top - 1, inView: b.bottom <= innerHeight };
  });
  eq(s, { rows: 5, scrolls: true, pinned: true, whole: true, below: true, inView: true }, "the picture stays at the top of the list while its rows scroll under it, and a name taken in hand stops below it, not under it");
  await pg.evaluate(() => { [2, 3, 4].forEach(i => document.querySelector('.scantick[data-i="' + i + '"]').click()); $("scan-log").click(); });
  await pg.waitForFunction(() => !!$("qc-price"));
  const held = await pg.evaluate(() => ({ url: _scanPic.url, orig: _scanPic.orig }));
  s = await pg.evaluate(() => { const d = $("dns-panel"), a = d.querySelector(".scanthumb").getBoundingClientRect(); return { of: d.querySelector(".qcof").textContent, top: d.scrollTop, under: a.top >= d.querySelector(".qcfrom").getBoundingClientRect().bottom - 1, over: a.bottom <= d.querySelector(".dntag").getBoundingClientRect().top + 1, reading: _scan }; });
  eq([s, await picAt("#dns-panel")], [{ of: "Cup 1 of 2", top: 0, under: true, over: true, reading: null }, { loads: true, pinned: "sticky", shows: "Cleaned up" }],
     "Log takes the picture on to the first cup's sheet, which starts at its top: under the line that says where the cup came from, over the drinks, the reading itself done with");
  await pg.click('#dns-panel .scanseg button[data-v="orig"]');
  eq(await pg.evaluate(() => [document.querySelector("#dns-panel .scanthumb img").src === _scanPic.orig, _scanPic.orig !== _scanPic.url]), [true, true], "…with the photo as you took it a tap away there too");
  await pg.evaluate(() => $("dns-panel").scrollTo(0, 200));
  await save();
  await pg.waitForFunction(() => /2 of 2/.test((document.querySelector(".qcof") || {}).textContent || ""));
  s = await pg.evaluate(() => ({ top: $("dns-panel").scrollTop, same: !!_scanPic && document.querySelector("#dns-panel .scanthumb img").src === _scanPic.orig }));
  eq([s, await picAt("#dns-panel")], [{ top: 0, same: true }, { loads: true, pinned: "sticky", shows: "Original" }], "saving a cup takes the picture on to the next, the one you chose still chosen, and that sheet starts at its top too");
  await save();
  const gone = u => pg.evaluate(async u => { const lost = src => new Promise(ok => { const i = new Image(); i.onload = () => ok(false); i.onerror = () => ok(true); i.src = src; }); return [$("dnsheet").hidden, _scanPic, await lost(u.url), await lost(u.orig)]; }, u);
  eq(await gone(held), [true, null, true, true], "the last cup saved, the picture is let go");
  await reset();
  await pg.evaluate(() => openQuickCup());
  await five();
  await pg.evaluate(() => $("scan-log").click());
  await pg.waitForFunction(() => !!$("qc-price"));
  eq(await pg.evaluate(() => { const had = !!_scanPic; closeSheet(); return [had, _scanPic]; }), [true, null], "…and so it is when a cup's sheet is put away");
  /* on to the whole form, by More options */
  await pg.evaluate(() => openQuickCup());
  await five();
  await pg.evaluate(() => $("scan-log").click());
  await pg.waitForFunction(() => !!$("qc-price"));
  await pg.evaluate(() => qcMore());
  await pg.waitForFunction(() => [...document.querySelectorAll("#f-drinks .dn")].some(x => /yuzu/i.test(x.value)));
  await pg.waitForTimeout(200);
  s = await pg.evaluate(() => {
    const at = $("f-scanpic"), sc = document.querySelector("#pane-form .scroll"), a = at.querySelector(".scanthumb").getBoundingClientRect(), p = sc.getBoundingClientRect();
    const row = [...document.querySelectorAll("#f-drinks .dr")].find(r => r.querySelector(".dn").value === "Cortado").getBoundingClientRect();
    return { view: app.dataset.view, shown: !at.hidden, pinned: sc.scrollTop > 0 && Math.abs(a.top - p.top) < 2, row: row.top >= a.bottom - 1, hide: $("f-scanpic-hide").getBoundingClientRect().height >= 44, wide: document.documentElement.scrollWidth <= innerWidth };
  });
  eq([s, await picAt("#f-scanpic")], [{ view: "form", shown: true, pinned: true, row: true, hide: true, wide: true }, { loads: true, pinned: "sticky", shows: "Cleaned up" }],
     "More options takes the picture on to the form with the rest of the receipt: pinned over the rows, the cup's own row brought to just below it");
  await pg.evaluate(() => $("f-scanpic-hide").click());
  eq(await pg.evaluate(() => [$("f-scanpic").hidden, $("f-scanpic").children.length, _scanPic]), [true, 0, null], "…until you hide it");
  /* and by a scan from the form itself */
  await pg.evaluate(() => { _formSnap = formSnapshot(); });
  await reset();
  await pg.evaluate(() => { userLoc = null; show("list"); logTab(); $("f-name").value = "New Place Coffee"; nameTyped(); });
  await five();
  await pg.evaluate(() => $("scan-log").click());
  await pg.waitForFunction(() => $("dnsheet").hidden && !$("f-scanpic").hidden);
  s = await pg.evaluate(() => ({ view: app.dataset.view, rows: [...document.querySelectorAll("#f-drinks .dn")].filter(x => x.value).length, reading: _scan }));
  eq([s, await picAt("#f-scanpic")], [{ view: "form", rows: 5, reading: null }, { loads: true, pinned: "sticky", shows: "Cleaned up" }], "a receipt scanned from Add a visit leaves its picture over the rows it filled in");
  const inForm = await pg.evaluate(() => ({ url: _scanPic.url, orig: _scanPic.orig }));
  await pg.evaluate(() => { _formSnap = formSnapshot(); closeForm(); });
  eq([await pg.evaluate(() => $("f-scanpic").hidden), (await gone(inForm)).slice(1)], [true, [null, true, true]], "…and leaving the form lets it go");
  await reset();

  /* with each drink's place on the receipt known, the picture is shown at the sheet's width, where it can be read, and
     moved to the drink in hand (v140): kept in view it was still 30% of the screen tall whatever the receipt's length */
  const places = text => pg.evaluate(text => {
    /* the reader's lines with where each is: the drinks in the lower half of the receipt, 7% of its height apart */
    scanRead = () => Promise.resolve({ text: text, doubt: [], rows: text.split("\n").map((t, k) => ({ t: t, y0: 0.5 + k * 0.07, y1: 0.53 + k * 0.07 })) });
  }, text);
  const zoomAt = at => pg.evaluate(at => {
    const w = document.querySelector(at + " .scanthumb.zoom");
    if (!w) return null;
    const m = w.querySelector(".scanmark"), a = w.getBoundingClientRect(), b = m.getBoundingClientRect(), i = w.querySelector("img").getBoundingClientRect();
    return { wide: Math.abs(i.width - w.clientWidth) < 2, scrolls: w.scrollHeight > w.clientHeight + 20, moved: w.scrollTop > 0, seen: m.hidden || (b.top >= a.top - 1 && b.bottom <= a.bottom + 1),
             line: m.hidden ? "" : (parseFloat(m.style.top) + parseFloat(m.style.height) / 2).toFixed(1) };
  }, at);
  await reset();
  await places("SAMPLE TEA BAR\nCORTADO 6.50\nHOJICHA LATTE 7.00\nYUZU FIZZ 6.00\nTOTAL 19.50");
  await pg.evaluate(() => openQuickCup());
  await shoot(shotFile(), "box");
  await listed();
  eq([await zoomAt("#dns-panel"), await picAt("#dns-panel")], [{ wide: true, scrolls: true, moved: true, seen: true, line: "" }, { loads: true, pinned: "sticky", shows: "Cleaned up" }],
     "with the drinks' places known the picture is at the sheet's width, in a window of its own that opens on the drinks, still pinned");
  await pg.focus('.scanname[data-i="2"]');
  eq(await zoomAt("#dns-panel"), { wide: true, scrolls: true, moved: true, seen: true, line: "72.5" }, "a drink's name taken in hand moves the picture to its line, and marks the line");
  await pg.click('.scanprice[data-i="0"]');
  eq((await zoomAt("#dns-panel")).line, "58.5", "…and so does its price, for another drink");
  await pg.click('#dns-panel .scanseg button[data-v="orig"]');
  eq((await zoomAt("#dns-panel")).line, "58.5", "…the photo as you took it shown at the same place");
  await pg.evaluate(() => $("scan-log").click());
  await pg.waitForFunction(() => !!$("qc-price"));
  s = await zoomAt("#dns-panel");
  await pg.evaluate(() => _qcRedraw());
  eq([s, await zoomAt("#dns-panel")], [{ wide: true, scrolls: true, moved: true, seen: true, line: "58.5" }, { wide: true, scrolls: true, moved: true, seen: true, line: "58.5" }],
     "each cup's sheet opens on its own cup's line, and is there still when the sheet is drawn again");
  await save();
  await pg.waitForFunction(() => /2 of 3/.test((document.querySelector(".qcof") || {}).textContent || ""));
  eq((await zoomAt("#dns-panel")).line, "65.5", "…the next cup's sheet on the next cup's");
  await pg.evaluate(() => qcMore());
  await pg.waitForFunction(() => [...document.querySelectorAll("#f-drinks .dn")].some(x => /yuzu/i.test(x.value)));
  eq(await zoomAt("#f-scanpic"), { wide: true, scrolls: true, moved: true, seen: true, line: "65.5" }, "…and in Add a visit it is at the form's width, on the cup that was taken there");
  await pg.evaluate(() => { _formSnap = formSnapshot(); closeForm(); });
  await reset();
  await readsAs("CORTADO 6.50\nTOTAL 6.50");
  await pg.evaluate(() => openQuickCup());
  await shoot(shotFile(), "box");
  await listed();
  eq([await zoomAt("#dns-panel"), await pg.evaluate(() => { const i = document.querySelector("#dns-panel .scanthumb img").getBoundingClientRect(); return i.height <= innerHeight * 0.3 + 1; })], [null, true], "a reader that says where nothing is leaves the picture whole, as it was");
  await reset();

  /* the box says when the photo is blurred or in shadow (v141): measured on pieces of the photo itself, before any
     time is spent reading. A printed sheet on a dark counter, as it is, blurred, and with its lower half in shadow */
  const sheetFor = how => pg.evaluate(how => {
    const c = document.createElement("canvas"); c.width = 1500; c.height = 2000;
    const g = c.getContext("2d");
    g.fillStyle = "#2e261f"; g.fillRect(0, 0, 1500, 2000);
    if (how === "blur") g.filter = "blur(6px)";
    g.fillStyle = "#f3f0e9"; g.fillRect(250, 200, 1000, 1600);
    g.fillStyle = "#222"; g.font = "bold 40px 'Courier New', monospace";
    for (let i = 0; i < 20; i++) g.fillText("SAMPLE LINE " + i + " OF PRINT 12.00", 300, 300 + i * 74);
    g.filter = "none";
    if (how === "shadow") { g.fillStyle = "rgba(0,0,0,0.65)"; g.fillRect(0, 1000, 1500, 1000); }
    return c.toDataURL("image/png").split(",")[1];
  }, how);
  const photoOf = async how => {
    await pg.setInputFiles("#scan-file", { name: "p.png", mimeType: "image/png", buffer: Buffer.from(await sheetFor(how), "base64") });
    await pg.waitForFunction(() => { const i = $("scan-cropimg"); return $("scan-read") && i && i.complete && i.naturalWidth > 0; });
    /* the box round the sheet, wherever the app would have started it */
    await pg.evaluate(() => { _scan.pic.quad = [[0.17, 0.1], [0.83, 0.1], [0.83, 0.9], [0.17, 0.9]]; _scanCropDraw(); });
  };
  const warned = () => pg.evaluate(() => { const w = $("scan-warn"); return { why: w ? w.dataset.why : "", says: w ? w.textContent : "", role: w ? w.getAttribute("role") : "", small: !!$("scan-small"),
    buttons: [...document.querySelectorAll("#scan-cropacts .dnact .btn, #scan-cropacts .scanalt")].map(x => x.textContent), tall: [...document.querySelectorAll("#scan-cropacts button")].every(x => x.getBoundingClientRect().height >= 44) }; });
  await reset();
  await readsAs("CORTADO 6.50\nTOTAL 6.50");
  await pg.evaluate(() => openQuickCup());
  await photoOf("");
  eq(await warned(), { why: "", says: "", role: "", small: false, buttons: ["Whole photo", "Read this part", "Retake"], tall: true }, "a sharp photo in even light is offered as it always was");
  await photoOf("blur");
  eq(await warned(), { why: "blur", says: "This photo looks blurred, so its print may not read. Hold the phone still and retake.", role: "status", small: false, buttons: ["Read anyway", "Retake", "Whole photo"], tall: true },
     "a blurred photo says so on the box before anything is read, with Retake first and reading it still a choice");
  await photoOf("shadow");
  eq(await warned(), { why: "shadow", says: "A shadow falls across the receipt, so part of it may not read. Turn to even light and retake.", role: "status", small: false, buttons: ["Read anyway", "Retake", "Whole photo"], tall: true },
     "…and so does one with a shadow across the sheet");
  await pg.evaluate(() => { _scan.pic.quad = [[0.17, 0.1], [0.83, 0.1], [0.83, 0.46], [0.17, 0.46]]; _scanCropDraw(); });
  eq((await warned()).why, "", "…which it stops saying when the box is drawn up out of the shadow, since it is the part boxed that is judged");
  await pg.evaluate(() => { _scan.pic.quad = [[0.17, 0.1], [0.83, 0.1], [0.83, 0.9], [0.17, 0.9]]; _scanCropDraw(); });
  await pg.click("#scan-read");
  await listed();
  eq(await pg.evaluate(() => [...document.querySelectorAll(".scanrow")].map(x => x.querySelector(".scanname").value)), ["Cortado"], "Read anyway reads it all the same");
  await pg.evaluate(() => closeSheet());

  /* a drink the reader doubted is read again by itself, cut from the photo at its own size (v141) */
  const twice = (first, strip) => pg.evaluate(a => {
    window.__seen = [];
    scanRead = image => {
      const band = image.height < image.width * 0.6, t = band ? a.strip : a.first;
      window.__seen.push(band ? "strip" : "whole");
      return Promise.resolve({ text: t.text, doubt: t.doubt, rows: t.text.split("\n").map((l, k, all) => ({ t: l, y0: (k + 0.3) / all.length, y1: (k + 0.7) / all.length })) });
    };
  }, { first, strip });
  const drinksNow = () => pg.evaluate(() => ({ rows: [...document.querySelectorAll(".scanrow")].map(x => x.querySelector(".scantick").getAttribute("aria-pressed") + " " + x.querySelector(".scanname").value + " $" + x.querySelector(".scanprice").value),
    unsure: [...document.querySelectorAll(".scanunsure")].map(x => x.textContent), seen: window.__seen }));
  const doubted = { text: "SAMPLE TEA BAR\nCachan $6.28\nTOTAL 6.28", doubt: ["Cachan", "$6.28"] };
  await reset();
  await twice(doubted, { text: "Cold Brew $6.25", doubt: [] });
  await pg.evaluate(() => openQuickCup());
  await shoot(shotFile(), "box");
  await listed();
  eq(await drinksNow(), { rows: ["true Cold Brew $6.25"], unsure: [], seen: ["whole", "whole", "strip"] },
     "a drink doubted on both looks has its line read again by itself, and what the reader is sure of this time is what the list shows: the crumpled receipt's Cachan $6.28 is Cold Brew $6.25");
  await reset();
  await twice(doubted, { text: "Cachan $6.28", doubt: ["Cachan"] });
  await pg.evaluate(() => openQuickCup());
  await shoot(shotFile(), "box");
  await listed();
  s = await drinksNow();
  eq([s.rows, s.unsure.length, s.seen], [["false Cachan $6.28"], 1, ["whole", "whole", "strip"]], "…a line doubted up close as well stays as it was, still marked for you to check");
  await reset();
  await twice({ text: "SAMPLE TEA BAR\nCortado $6.50\nie 12.5\nTAX 0.50", doubt: ["ie"] }, { text: "Total 12.50", doubt: [] });
  await pg.evaluate(() => openQuickCup());
  await shoot(shotFile(), "box");
  await listed();
  s = await drinksNow();
  eq([s.rows, s.unsure], [["true Cortado $6.50"], []], "…and a doubted row that turns out, read up close, to be the total and no drink at all is taken off the list");
  await reset();

  /* on a pale table there is no bright paper to find, and the box starts round the print (v138) */
  const pale = await pg.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 1500; c.height = 2000;
    const g = c.getContext("2d"); g.fillStyle = "#e9e7e2"; g.fillRect(0, 0, 1500, 2000);
    g.fillStyle = "#efede8"; g.fillRect(450, 500, 600, 1000);
    g.fillStyle = "#222"; g.font = "bold 34px 'Courier New', monospace";
    for (let i = 0; i < 16; i++) g.fillText(i % 5 === 4 ? "TOTAL          6.50" : "CORTADO HOJICHA 6.50", 500, 600 + i * 54);
    return c.toDataURL("image/png").split(",")[1];
  });
  await reset();
  await pg.evaluate(() => openQuickCup());
  await shoot({ name: "p.png", mimeType: "image/png", buffer: Buffer.from(pale, "base64") }, "stay");
  bx = await box();
  const sheetOf = [[450, 500], [1050, 500], [1050, 1500], [450, 1500]].map(p => [p[0] / 1500, p[1] / 2000]);
  eq([bx.guess, far(bx.quad, sheetOf) < 110, bx.on], [true, true, true], "a receipt on a table as pale as it is has its box started round its print, near its own edges (" + Math.round(far(bx.quad, sheetOf)) + "px off at most, of 1500)");
  await pg.evaluate(() => closeSheet());

  /* shared to the app from the phone's share sheet (v133) */
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  eq(man.share_target, { action: "./share", method: "POST", enctype: "multipart/form-data", params: { title: "title", text: "text", url: "url", files: [{ name: "photo", accept: ["image/*"] }] } },
     "the installed app is in the share sheet, for text and for photos, as a POST so nothing shared is in an address");
  const share = (text, withPhoto) => pg.evaluate(async a => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(ok => navigator.serviceWorker.addEventListener("controllerchange", ok, { once: true }));
    const fd = new FormData();
    if (a.text) fd.append("text", a.text);
    if (a.photo) fd.append("photo", new Blob([Uint8Array.from(atob(a.photo), c => c.charCodeAt(0))], { type: "image/png" }), "r.png");
    const res = await fetch("./share", { method: "POST", body: fd });
    const c = await caches.open("cafemap-share");
    const t = await c.match("./__share/text"), p = await c.match("./__share/photo");
    return { to: new URL(res.url).search, ok: res.ok, text: t ? (await t.text()).split("\r").join("") : null, photo: p ? (await p.blob()).type : null };
  }, { text, photo: withPhoto ? photo : "" });
  s = await share("CORTADO 6.50\nTOTAL 6.50", false);
  eq(s, { to: "?do=scan", ok: true, text: "CORTADO 6.50\nTOTAL 6.50", photo: null }, "the service worker keeps what was shared on the phone and opens the app on ?do=scan");
  await pg.evaluate(() => { if (app.dataset.view === "form") _formSnap = formSnapshot(); });
  await reset();
  await pg.evaluate(() => { userLoc = null; show("list"); return scanShared(); });
  await pg.waitForFunction(() => app.dataset.view === "form", null, { timeout: 15000 });
  s = await pg.evaluate(async () => ({ scan: !$("f-scan").hidden, kept: (await caches.keys()).includes("cafemap-share"), sheet: !$("dnsheet").hidden }));
  eq(s, { scan: false, kept: false, sheet: false }, "with no cafe to hand it opens Add a visit and waits for the cafe's name, and the stored copy is gone");
  await pg.fill("#f-name", "New Place Coffee");
  await pg.click("#f-scan");
  s = await pg.evaluate(() => ({ title: $("dns-title").textContent, name: document.querySelector(".scanname").value, price: (v => (v ? "$" + v : ""))(document.querySelector(".scanprice").value) }));
  eq(s, { title: "Is this yours?", name: "Cortado", price: "$6.50" }, "…then Scan reads what was shared, with no photo asked for");
  await pg.evaluate(() => closeSheet());
  const [next] = await Promise.all([pg.waitForEvent("filechooser"), pg.click("#f-scan")]);
  eq([!!next, await pg.evaluate(() => $("dnsheet").hidden)], [true, true], "…once: the next Scan is an ordinary one, and opens the camera");
  await pg.evaluate(() => { closeSheet(); _formSnap = formSnapshot(); });
  s = await share("", true);
  eq([s.text, s.photo], ["", "image/png"], "a shared photo is kept the same way");
  await reset();
  await pg.evaluate(() => { window.__text = "CORTADO 6.50\nTOTAL 6.50"; scanRead = window.__stub; userLoc = { lat: 37.77, lng: -122.4 }; userLocAt = Date.now(); show("list"); return scanShared(); });
  await pg.waitForFunction(() => { const i = $("scan-cropimg"); return $("scan-read") && i && i.complete && i.naturalWidth > 0; });
  s = await pg.evaluate(() => ({ view: app.dataset.view, cafe: curId, title: $("dns-title").textContent }));
  eq(s, { view: "detail", cafe: "c1", title: "Where’s the receipt?" }, "standing in a cafe on your list, a shared photo comes up for that cafe at once, at its box (v135)");
  await pg.click("#scan-all");
  await pg.waitForFunction(() => { const i = document.querySelector("#dns-panel .scanthumb img"); return document.querySelector("#dns-panel .scanrow") && i && i.complete && i.naturalWidth > 0; });
  s = await pg.evaluate(() => ({ title: $("dns-title").textContent, name: document.querySelector(".scanname").value }));
  eq(s, { title: "Is this yours?", name: "Cortado" }, "…and is read from there, straight to the drinks");
  await pg.evaluate(() => { closeSheet(); userLoc = null; isAdmin = false; });
  await share("CORTADO 6.50", false);
  s = await pg.evaluate(async () => { await scanShared(); const kept = (await caches.keys()).includes("cafemap-share"); await caches.delete("cafemap-share"); isAdmin = true; return { kept, view: app.dataset.view, sheet: !$("dnsheet").hidden }; });
  eq(s, { kept: true, view: "detail", sheet: false }, "a visitor's share does nothing");

  /* the reader failing */
  await pg.evaluate(() => { scanRead = () => Promise.reject(new Error("no wasm")); });
  await scan([]);
  s = await pg.evaluate(() => document.querySelector(".dnhead p").textContent);
  eq(s, "Something went wrong reading that. Try again, or type it in.", "a reader that fails says so");

  /* cancel */
  await pg.evaluate(() => { window.__late = null; scanRead = (image, signal) => { window.__signal = signal; return new Promise(ok => { window.__late = ok; }); }; });
  await reset();
  await pg.evaluate(() => openQuickCup());
  await shoot(file());
  await pg.waitForFunction(() => !!window.__late);
  s = await pg.evaluate(() => ({ title: $("dns-title").textContent, img: !$("scan-img").hidden }));
  eq(s, { title: "Reading your receipt…", img: true }, "while it reads you see your photo");
  await pg.click(".scanr .ocx");
  await pg.evaluate(() => window.__late("CORTADO 5.00\nTOTAL 5.00"));
  await pg.waitForTimeout(50);
  s = await pg.evaluate(() => ({ aborted: window.__signal.aborted, hidden: $("dnsheet").hidden, scan: _scan === null }));
  eq(s, { aborted: true, hidden: true, scan: true }, "Cancel stops it, and an answer arriving afterwards does nothing");

  /* what the receipt says is only ever text */
  await pg.evaluate(() => { scanRead = window.__stub; });
  await scan(["<img src=x onerror=alert(1)> 3.00", "Drip 2.00", "TOTAL 5.00"]);
  s = await pg.evaluate(() => ({ imgs: document.querySelectorAll(".scantext img").length, printed: document.querySelector(".scantext small").textContent,
    first: document.querySelector(".scantick").getAttribute("aria-pressed") + " " + document.querySelector(".scannote").textContent }));
  eq(s, { imgs: 0, printed: "Printed: <img src=x onerror=alert(1)>", first: "true new here" }, "text from a receipt is shown as text, never as markup, even as the name of a drink to tick");

  /* the real reader, on a drawn receipt, under the real page */
  const receipt = await pg.evaluate(() => {
    const lines = ["SAMPLE TEA BAR", "123 MAIN ST", "11/05/2026 2:14 PM", "", "1 ICD MTCHA LT        6.75", "+ OAT MILK            1.00", "1 CORTADO             5.25", "1 CROISSANT           5.00", "", "SUBTOTAL             18.00", "TAX                   1.58", "TOTAL                19.58", "", "THANK YOU"];
    const c = document.createElement("canvas"); c.width = 900; c.height = 60 + lines.length * 62;
    const g = c.getContext("2d"); g.fillStyle = "#f3efe6"; g.fillRect(0, 0, c.width, c.height); g.fillStyle = "#222"; g.font = "bold 44px 'Courier New', monospace";
    lines.forEach((t, i) => g.fillText(t, 40, 70 + i * 62));
    return c.toDataURL("image/png").split(",")[1];
  });
  const sent = [];
  pg.on("request", r => { if (!r.url().startsWith(srv.origin) && !/^(data|blob):/.test(r.url())) sent.push(r.method() + " " + r.url()); });
  const csp = [];
  pg.on("console", m => { if (/Content Security Policy/i.test(m.text())) csp.push(m.text()); });
  await reset();
  await pg.evaluate(() => { scanRead = window.__realRead; openQuickCup(); });
  await shoot({ name: "r.png", mimeType: "image/png", buffer: Buffer.from(receipt, "base64") });
  await pg.waitForFunction(() => !document.querySelector(".scanr"), null, { timeout: 90000 });
  p = await pick().catch(async () => ({ rows: await pg.evaluate(() => $("dns-panel").textContent) }));
  eq(p.rows, ["true Iced matcha latte $7.75", "true Cortado $5.25", "false Croissant $5.00"], "the real reader, on the page's own files, reads a receipt into cups");
  await reset();
  await pg.evaluate(() => openQuickCup());
  await shoot(shotFile(), "box");
  await pg.waitForFunction(() => !document.querySelector(".scanr"), null, { timeout: 90000 });
  const flat = await pg.evaluate(() => ($("scan-text") ? $("scan-text").value : $("dns-panel").textContent));
  p = await pick().catch(async () => ({ rows: await pg.evaluate(() => $("dns-panel").textContent) }));
  eq(p.rows, ["true Cortado $6.50"], "…and a leaning receipt, boxed where the app found it and pulled flat, reads true (" + JSON.stringify(flat) + ")");
  eq(await pg.evaluate(() => [Array.isArray(_scan.doubt), _scan.doubt.every(w => typeof w === "string"), !!_scan.orig && _scan.orig !== _scan.url]), [true, true, true], "…with the real reader's own list of words it doubted, and both pictures kept");
  eq(await pg.evaluate(() => [!!_scan.band, _scan.items.every(x => x.at && x.at.y0 > 0 && x.at.y1 < 1 && x.at.y1 > x.at.y0), !!document.querySelector("#dns-panel .scanthumb.zoom")]), [true, true, true],
     "…and where each drink is on the receipt, so the picture is shown at the sheet's width and can be moved to it");
  eq([sent.filter(u => /^(POST|PUT)/.test(u) || /jsdelivr|unpkg|tessdata/.test(u)), csp], [[], []], "…sending nothing anywhere, fetching nothing from elsewhere, and within the page's security policy");

  eq(errs, [], "no page errors");
  await ctx.close();
  await b.close();
  srv.close();
  process.exit(done() ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
