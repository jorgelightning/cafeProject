/* The postcard is a Story, and it draws the kind of place it is about.

   It used to print the stored emoji, which is the coffee cup by default for most records (a hojicha bar went out
   with a coffee cup), on a fade that was the verdict colour for every cafe. Now the mark is a vessel drawn in
   line art (bowl, cup, boba, gelato, pastry) on a fade in the drink's own colour, chosen from what the place
   serves, and a deliberately chosen emoji still wins. The picture is 1080 x 1920 for Instagram Stories: the colour
   runs edge to edge while every word stays out of the bands the app lays over the top and bottom. */
const { serve, launch, checker } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await pg.waitForTimeout(900);

  /* ---- what a place serves ---- */
  const kinds = await pg.evaluate(() => {
    const d = (n, orders) => ({ n, orders: orders || [{ date: "2026-09-01" }] });
    const k = c => cafeKind(c);
    return {
      kiss: k({ name: "Kiss of Matcha", emoji: "☕", drinks: [d("Hojicha latte")] }),
      kissaten: k({ name: "Kissaten HiFi", emoji: "☕", drinks: [d("Flat White", [{ date: "2026-09-01" }, { date: "2026-09-02" }]), d("Hojicha latte")] }),
      oolong: k({ name: "Oolong Tea Project", emoji: "☕", drinks: [d("Cheese Foam Ruby Oolong Tea (Large)")] }),
      boba: k({ name: "Boba Guys Fillmore", emoji: "☕", drinks: [] }),
      gelato: k({ name: "Zen Gelato & Bar", emoji: "☕", drinks: [d("Matcha latte")] }),
      pastry: k({ name: "Diamond Coffee n' Pastry", emoji: "☕", drinks: [d("Latte")] }),
      plain: k({ name: "Morning Glass", emoji: "☕", drinks: [d("Drip")] }),
      bare: k({ name: "Nothing Yet", drinks: [] }),
      chosenTea: k({ name: "Corner Coffee", emoji: "🍵", drinks: [d("Latte")] }),
      chosenBoba: k({ name: "Kiss of Matcha", emoji: "🧋", drinks: [d("Hojicha latte")] }),
      komeya: k({ name: "Komeya No Bento", emoji: "☕", tags: ["matcha", "to-go"], drinks: [d("Hojicha latte", [{ date: "2026-09-01" }, { date: "2026-09-02" }]), d("Jasmine Yuzu Tea Aiyu Jelly"), d("Iced Hojicha Latte w/ Salted Cheese Foam")] }),
      misspelt: k({ name: "8 Grams Matcha", emoji: "☕", drinks: [d("Mattcha Latte (Kuro blend)")] }),
      teaLatte: k({ name: "Chicha San Chen", emoji: "☕", drinks: [d("Honey Cassia Black Tea Latte")] }),
      toppingOnly: k({ name: "Some Place", emoji: "☕", drinks: [d("Hojicha latte w/ cheese foam")] }),
      tagOnly: k({ name: "Quiet Room", emoji: "☕", tags: ["matcha"], drinks: [d("Seasonal special")] }),
      coffeeNamedTeaTop: k({ name: "Origin Lab Coffee & Matcha", emoji: "☕", drinks: [d("Hojicha latte")] })
    };
  });
  eq(kinds.kiss, "matcha", "a hojicha bar is a bowl, not a coffee cup");
  eq(kinds.kissaten, "coffee", "…and a place you go to for a flat white is a cup, whatever its name says");
  eq(kinds.oolong, "boba", "cheese-foam oolong is boba");
  eq(kinds.boba, "boba", "…and so is a name that says it");
  eq(kinds.gelato, "gelato", "gelato wins even when the drink is a matcha latte");
  eq(kinds.pastry, "pastry", "a pastry shop is pastry");
  eq([kinds.plain, kinds.bare], ["coffee", "coffee"], "a plain cafe, or one with nothing logged, is a coffee cup");
  eq([kinds.chosenTea, kinds.chosenBoba], ["matcha", "boba"], "an emoji you chose beats the guess");
  eq(kinds.komeya, "matcha", "Komeya No Bento is matcha: a salted cheese foam topping on a hojicha latte does not make it boba");
  eq(kinds.misspelt, "matcha", "a double-t \"Mattcha\" is still matcha");
  eq(kinds.teaLatte, "boba", "a black tea latte is tea, not coffee, whatever the word latte says");
  eq(kinds.toppingOnly, "matcha", "…a topping never outvotes the drink it sits on");
  eq(kinds.tagOnly, "matcha", "…and the cafe's own matcha tag counts when no drink says anything");
  eq(kinds.coffeeNamedTeaTop, "matcha", "what you order there outranks the word 'coffee' in the name");

  /* ---- drawing it ---- */
  const draw = spec => pg.evaluate(k => {
    const calls = [];
    const orig = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, x, y) { calls.push({ t: String(t), x, y, font: this.font }); return orig.apply(this, arguments); };
    const cv = document.createElement("canvas"); cv.width = 1080; cv.height = 1920;
    drawPostcard(cv, { name: k.name || "Kiss of Matcha", area: "Outer Sunset", rk: 56, rn: 111, label: "Loved it", color: "#2e9e5b", drink: k.drink || "Hojicha latte", price: "$7.84", count: 1,
                       review: k.review || "That nice hojicha taste is prominent", emoji: "☕", tint: "#2e9e5b", kind: k.kind });
    CanvasRenderingContext2D.prototype.fillText = orig;
    const c2 = cv.getContext("2d");
    const px = (x, y) => Array.from(c2.getImageData(x, y, 1, 1).data).slice(0, 3);
    let cream = 0; const area = c2.getImageData(300, 293, 480, 480).data;
    for (let i = 0; i < area.length; i += 4) if (area[i] > 225 && area[i + 1] > 215 && area[i + 2] > 195) cream++;
    return { calls, corner: px(20, 20), cream, url: cv.toDataURL("image/png").length };
  }, spec);

  const imgs = {};
  for (const kd of ["matcha", "coffee", "boba", "gelato", "pastry"]) imgs[kd] = await draw({ kind: kd });
  const [mr, mg] = imgs.matcha.corner, [cr, cg, cb] = imgs.coffee.corner, [br, bg] = imgs.boba.corner, [gr, gg, gb] = imgs.gelato.corner;
  eq(mg > mr, true, "a matcha card fades green, not brown (" + imgs.matcha.corner + ")");
  eq(cr > cg && cg > cb, true, "a coffee card roasts brown (" + imgs.coffee.corner + ")");
  eq(br > bg, true, "a boba card is warm rose (" + imgs.boba.corner + ")");
  eq(gr > gg && gb > gg, true, "a gelato card is pink (" + imgs.gelato.corner + ")");
  eq(Object.values(imgs).every(i => i.cream > 400), true, "every kind draws its vessel in cream line art (" + Object.values(imgs).map(i => i.cream).join(", ") + " cream pixels)");
  eq(new Set(Object.values(imgs).map(i => i.url)).size, 5, "…and the five pictures are all different");

  /* ---- no emoji, no app, only the brand ---- */
  const texts = imgs.matcha.calls.map(c => c.t);
  eq(texts.some(t => /[\u{1F300}-\u{1FAFF}☕]/u.test(t)), false, "nothing is typed as an emoji any more");
  eq(texts.some(t => /OPEN IN THE APP/i.test(t)), false, "the card no longer says 'open in the app'");
  eq(texts.includes("JL CAFE PROJECT"), true, "…the footer is just whose list it is");

  /* ---- the rank and where it stands are a pair, not two ends of the card ---- */
  const rk = imgs.matcha.calls.find(c => /^#\d+$/.test(c.t)), st = imgs.matcha.calls.find(c => /^of \d+ on my list$/.test(c.t));
  eq(!!rk && !!st && st.y > rk.y && Math.abs(st.x - rk.x) < 120, true, "\"of 111 on my list\" sits directly under the rank, not at the far edge (rank " + (rk && Math.round(rk.x)) + "," + (rk && Math.round(rk.y)) + "; standing " + (st && Math.round(st.x)) + "," + (st && Math.round(st.y)) + ")");

  /* ---- Story safe zones: 14% top, 13% bottom ---- */
  const inside = calls => ({ min: Math.min(...calls.map(c => c.y)), max: Math.max(...calls.map(c => c.y)) });
  let band = inside(imgs.matcha.calls);
  eq(band.min >= 269, true, "the rank sits below the profile bar (first text at y " + Math.round(band.min) + ", needs 269+)");
  eq(band.max <= 1670, true, "…and the footer above the reply bar (last text at y " + Math.round(band.max) + ", needs 1670 or less)");
  const worst = await draw({ kind: "boba", name: "Extraordinarily Long Cafe Name That Wraps Over Two Lines Easily", drink: "Cheese Foam Ruby Oolong Tea With Extra Pearls And A Very Long Name (Large)",
    review: "I came here three times in one week and every time the staff remembered my order, the room was quiet enough to read in, and the tea was properly steeped rather than syrupy, which is rare." });
  band = inside(worst.calls);
  const rev = worst.calls.filter(c => /500 42px/.test(c.font)).map(c => c.y);
  eq(band.max <= 1670 && band.min >= 269, true, "even the worst case (long name, long drink, long note) stays in the band (" + Math.round(band.min) + " to " + Math.round(band.max) + ")");
  eq(rev.length >= 2 && Math.max(...rev) < 1586, true, "…and the note stops above the footer rule (last line at " + Math.round(Math.max(...rev)) + ", rule at 1586)");

  /* ---- it fits the screen with its buttons ---- */
  const fit = await pg.evaluate(() => {
    isAdmin = true; applyMode(); cafes = [{ id: "a", name: "Kiss of Matcha", area: "Outer Sunset", rating: 4, elo: 1500, matches: 3, emoji: "☕", drinks: [{ n: "Hojicha latte", orders: [{ date: "2026-09-01", p: 7 }] }] }];
    show("list"); openDetail("a", "list"); openPostcard();
    const cv = document.getElementById("pc-canvas"), r = cv.getBoundingClientRect(), sh = document.getElementById("pc-share").getBoundingClientRect();
    return { size: [cv.width, cv.height], shareBottom: Math.round(sh.bottom), win: innerHeight, ratio: +(r.width / r.height).toFixed(3) };
  });
  eq(fit.size, [1080, 1920], "the picture is 1080 x 1920");
  eq(fit.ratio, 0.563, "…shown at its own 9:16 proportions");
  eq(fit.shareBottom <= fit.win, true, "on a small phone the Share button is still on screen with the card (" + fit.shareBottom + " of " + fit.win + ")");

  eq(errs, [], "no page errors");
  await ctx.close(); await b.close(); srv.close(); process.exit(done() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
