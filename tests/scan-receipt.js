/* Scan a receipt (v127), in the page.

   A photo goes in through the real file box and is read on the phone. One drink goes straight to the filled-in sheet,
   several ask which were yours and then bring the sheet up once each, a payment screen says it only shows a total, and
   a photo it cannot read says so. Nothing is saved until you press Save, and nothing is sent anywhere. Most checks
   replace the text reader with the text it would have read; the last runs the real one on a drawn receipt, under the
   page's real Content Security Policy. What the parser makes of a receipt's text is tests/unit/scan.test.mjs. */
const { serve, launch, checker, ready } = require("./harness");
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
  /* a photo read in the app stops at the review first (v131); the helpers press Find the drinks */
  const past = async () => { if (await pg.evaluate(() => !$("dnsheet").hidden && !!document.querySelector("#dns-panel .scanthumb"))) await pg.click("#scan-go"); };
  const one = async () => { if (await pg.evaluate(() => !$("dnsheet").hidden && document.querySelectorAll("#dns-panel .scanrow").length === 1)) await pg.click("#dns-panel .dnact .btn:last-child"); };
  const scan = async (lines, stay) => {
    await reset();
    await pg.evaluate(t => { window.__text = t; openQuickCup(); }, lines.join("\n"));
    await pg.setInputFiles("#scan-file", file());
    await pg.waitForFunction(() => !document.querySelector(".scanr"));
    await past();
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
  s = await pg.evaluate(() => ({ title: $("dns-title").textContent, rows: [...document.querySelectorAll(".scanrow")].map(x => x.querySelector(".scantick").getAttribute("aria-pressed") + " " + x.querySelector(".scanname").value + " " + x.querySelector(".scanp").textContent),
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

  /* the review: your photo and what it read, to put right before anything is made of it (v131) */
  await reset();
  await pg.evaluate(() => { window.__text = "Xqzv 6.50\nTOTAL 6.50"; openQuickCup(); });
  await pg.setInputFiles("#scan-file", file());
  await pg.waitForFunction(() => { const i = document.querySelector("#dns-panel .scanthumb img"); return i && i.complete && i.naturalWidth > 0; });
  s = await pg.evaluate(() => ({ title: $("dns-title").textContent, text: $("scan-text").value, go: $("scan-go").textContent + ($("scan-go").disabled ? " off" : ""), back: document.querySelector("#dns-panel .dnact .btn").textContent,
    close: !!document.querySelector("#dns-panel .ocx"), blob: document.querySelector(".scanthumb img").src.startsWith("blob:"), saved: cafes[0].drinks.length, wide: document.documentElement.scrollWidth <= innerWidth }));
  eq(s, { title: "Check what it read", text: "Xqzv 6.50\nTOTAL 6.50", go: "Find the drinks", back: "Retake", close: true, blob: true, saved: 2, wide: true },
     "a photo read in the app stops at your photo and the text it read, with nothing made of it yet");
  await pg.click("#scan-go");
  s = await pg.evaluate(() => ({ tick: document.querySelector(".scantick").getAttribute("aria-pressed"), note: document.querySelector(".scannote").textContent, go: $("scan-log").textContent + ($("scan-log").disabled ? " off" : "") }));
  eq(s, { tick: "false", note: "Not sure it’s a drink", go: "Tick a drink off" }, "a line that names no drink comes to the list unticked");
  await pg.fill("#dns-panel .scanname", "Flat white");
  s = await pg.evaluate(() => ({ tick: document.querySelector(".scantick").getAttribute("aria-pressed"), go: $("scan-log").textContent, focus: document.activeElement.className, tall: document.querySelector(".scanname").getBoundingClientRect().height >= 44 }));
  eq(s, { tick: "true", go: "Log 1 cup", focus: "scanname", tall: true }, "its name is a box: putting it right ticks the row, and the cursor stays in the box");
  await pg.fill("#dns-panel .scanname", "  ");
  eq(await pg.evaluate(() => $("scan-log").textContent + ($("scan-log").disabled ? " off" : "")), "Tick a drink off", "a row with no name is not logged");
  await pg.click("#dns-panel .dnact .btn:first-child");
  await pg.waitForFunction(() => { const i = document.querySelector("#dns-panel .scanthumb img"); return i && i.complete && i.naturalWidth > 0; });
  eq(await pg.evaluate(() => [$("dns-title").textContent, $("scan-text").value]), ["Check what it read", "Xqzv 6.50\nTOTAL 6.50"], "Back to the text shows the photo and the text again");
  await pg.fill("#scan-text", "Cortado 6.50\nTOTAL 6.50");
  await pg.click("#scan-go");
  s = await pg.evaluate(() => [document.querySelector(".scantick").getAttribute("aria-pressed"), document.querySelector(".scanname").value, document.querySelector(".scanp").textContent]);
  eq(s, ["true", "Cortado", "$6.50"], "the text put right is what the drinks are found in");
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
  const pick = () => pg.evaluate(() => ({ title: $("dns-title").textContent, rows: [...document.querySelectorAll(".scanrow")].map(x => x.querySelector(".scantick").getAttribute("aria-pressed") + " " + x.querySelector(".scanname").value + " " + x.querySelector(".scanp").textContent),
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
  await scan(["~~ ;; ee", "SAMPLE TEA BAR"]);
  s = await pg.evaluate(() => ({ title: $("dns-title").textContent, why: document.querySelector(".dnhead p").textContent, buttons: [...document.querySelectorAll("#dns-panel .dnact .btn")].map(x => x.textContent) }));
  eq(s, { title: "Couldn’t read that", why: "No drinks found in that text. Check that it all came across, or type it in.", buttons: ["Type it in", "Try again"] }, "text with no drinks in it says so and offers both ways on");
  await pg.click("#dns-panel .dnact .btn:last-child");
  s = await pg.evaluate(() => ({ title: $("dns-title").textContent, text: $("scan-text").value, photo: !!document.querySelector(".scanthumb img") }));
  eq(s, { title: "Check what it read", text: "~~ ;; ee\nSAMPLE TEA BAR", photo: true }, "…Try again goes back to the photo and its text");
  await pg.evaluate(() => scanBack());
  await pg.click("#scan-go");
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

  /* Scan opens on a box for the phone's own reader (v129) */
  const ticket = [earlier, "Alex", "FOR HERE", "1 × Matcha Guava Cream", "Top (16oz)", "Lactose Free Whole", "Milk", "No Sweet"].join("\n");
  await reset();
  await pg.evaluate(() => openQuickCup());
  await pg.click("#dns-panel .qcscan");
  s = await pg.evaluate(() => ({ title: $("dns-title").textContent, box: !!$("scan-text"), go: $("scan-go").disabled, photo: (document.querySelector(".scanalt") || {}).textContent, close: !!document.querySelector("#dns-panel .ocx"),
    focus: document.activeElement.id, tall: $("scan-go").getBoundingClientRect().height >= 44 && document.querySelector(".scanalt").getBoundingClientRect().height >= 44, wide: document.documentElement.scrollWidth <= innerWidth }));
  eq(s, { title: "Scan a receipt", box: true, go: true, photo: "Or read a photo in the app", close: true, focus: "dns-title", tall: true, wide: true },
     "Scan opens on a box for the receipt's text, with Read it off until there is some and the photo as the second choice");
  await pg.fill("#scan-text", "nothing useful here");
  eq(await pg.evaluate(() => $("scan-go").disabled), false, "typing or pasting turns Read it on");
  await pg.click("#scan-go");
  s = await pg.evaluate(() => document.querySelector(".dnhead p").textContent);
  eq(s, "No drinks found in that text. Check that it all came across, or type it in.", "text with no drinks in it says so");
  await pg.click("#dns-panel .dnact .btn:last-child");
  eq(await pg.evaluate(() => $("scan-text").value), "nothing useful here", "…and Try again brings the text back to fix");
  await pg.evaluate(t => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText: async () => t } }); }, ticket);
  await pg.click("#dns-panel .dnact .btn:first-child");
  await pg.waitForFunction(t => $("scan-text").value === t, ticket);
  eq(await pg.evaluate(() => $("scan-go").disabled), false, "Paste fills the box from the clipboard");
  await pg.click("#scan-go");
  await one();
  s = await sheet();
  eq([s.title, s.on, s.same, s.spec, s.price, s.date.includes("Today")], ["A cup at Sample Tea Bar", ["Matcha Guava Cream Top"], "✓ From the receipt", "16 oz · lactose-free · no sugar", "", false],
     "an order ticket with no prices fills in the drink, its wrapped name, size, milk and sweetness, on the ticket's date");
  await save();
  saved = (await orders("Matcha Guava Cream Top")).pop();
  eq([saved.date, saved.size, saved.milk, saved.sweet, saved.p], [earlier, "16 oz", "Lactose-free", "0%", undefined], "…and saves it with no price, since the ticket had none");
  await pg.evaluate(() => { openQuickCup(); scanStart(); });
  eq(await pg.evaluate(() => $("scan-text").value), "", "a reading that worked leaves the box empty next time");
  await pg.evaluate(() => closeSheet());

  /* Log with no cafe open: Add a visit has Scan too */
  const fromLog = async lines => {
    await pg.evaluate(() => { if (app.dataset.view === "form") _formSnap = formSnapshot(); });
    await reset();
    await pg.evaluate(t => { userLoc = null; show("list"); window.__text = t; logTab(); $("f-name").value = "New Place Coffee"; nameTyped(); }, lines.join("\n"));
    await pg.setInputFiles("#scan-file", file());
    await pg.waitForFunction(() => !document.querySelector(".scanr") || $("dnsheet").hidden);
    await past();
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
  await fromLog(["~~ ;; ee"]);
  await pg.click("#dns-panel .dnact .btn:first-child");
  s = await form();
  eq([s.view, s.sheet], ["form", false], "Type it in from the form goes back to the form");
  await pg.evaluate(() => { _formSnap = formSnapshot(); });
  await reset();
  await pg.evaluate(() => { userLoc = null; show("list"); logTab(); });
  await pg.fill("#f-name", "New Place Coffee");
  await pg.click("#f-scan");
  await pg.fill("#scan-text", ticket);
  await pg.click("#scan-go");
  await one();
  s = await form();
  eq([s.view, s.name, s.rows, s.sheet], ["form", "New Place Coffee", ["Matcha Guava Cream Top "], false], "a ticket pasted into Add a visit adds the drink and leaves the cafe's name as you typed it");

  /* always a way out */
  await pg.evaluate(() => { _formSnap = formSnapshot(); });
  await scan(["~~ ;; ee"]);
  await pg.click("#dns-panel .ocx");
  s = await pg.evaluate(() => ({ view: app.dataset.view, hidden: $("dnsheet").hidden, scan: _scan === null }));
  eq(s, { view: "detail", hidden: true, scan: true }, "a failed scan has a close button that goes back to where you were");
  await scan(["Cortado 5.00", "Drip 2.00", "TOTAL 7.00"]);
  await pg.click("#dns-panel .ocx");
  eq(await pg.evaluate(() => $("dnsheet").hidden), true, "…and so does the list to tick");
  await scan(["~~ ;; ee"]);
  await pg.evaluate(() => window.dispatchEvent(new PopStateEvent("popstate")));
  s = await pg.evaluate(() => ({ view: app.dataset.view, hidden: $("dnsheet").hidden }));
  eq(s, { view: "detail", hidden: true }, "the phone's back gesture puts the sheet away instead of leaving it on top");

  /* the reader failing */
  await pg.evaluate(() => { scanRead = () => Promise.reject(new Error("no wasm")); });
  await scan([]);
  s = await pg.evaluate(() => document.querySelector(".dnhead p").textContent);
  eq(s, "Something went wrong reading that. Try again, or type it in.", "a reader that fails says so");

  /* cancel */
  await pg.evaluate(() => { window.__late = null; scanRead = (image, signal) => { window.__signal = signal; return new Promise(ok => { window.__late = ok; }); }; });
  await reset();
  await pg.evaluate(() => openQuickCup());
  await pg.setInputFiles("#scan-file", file());
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
  eq(s, { imgs: 0, printed: "Printed: <img src=x onerror=alert(1)>", first: "false Not sure it’s a drink" }, "text from a receipt is shown as text, never as markup, and a line that names no drink is listed unticked");

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
  await pg.setInputFiles("#scan-file", { name: "r.png", mimeType: "image/png", buffer: Buffer.from(receipt, "base64") });
  await pg.waitForFunction(() => !document.querySelector(".scanr"), null, { timeout: 90000 });
  await past();
  p = await pick().catch(async () => ({ rows: await pg.evaluate(() => $("dns-panel").textContent) }));
  eq(p.rows, ["true Iced matcha latte $7.75", "true Cortado $5.25", "false Croissant $5.00"], "the real reader, on the page's own files, reads a receipt into cups");
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
