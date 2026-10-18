/* Coffee and Tea Wrapped: the shape of your orders, whether you would reorder them, and chains
   against independents.

   "Your usual" printed the single most common value of each option as a chip. Each option is now a
   bar of its whole spread under the sentence it adds up to, next to the drink you order most and the
   one you took a chance on. "Worth it" reads the reorder verdict nothing used to read. Chains are the
   same brand groups the cafe page uses for branches. Nothing here reads a place. */
const { serve, launch, checker, ready } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 800 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await ready(pg);

  const r = await pg.evaluate(() => {
    isAdmin = false; applyMode();
    const o = (date, p, extra) => Object.assign({ date, p }, extra || {});
    cafes = [
      { id: "a", name: "Tadaima Marina", brand: "Tadaima", area: "Marina", rating: 5, drinks: [
        { n: "Hojicha latte", orders: [o("2026-09-01", 7, { sweet: "0%", ice: "Warm", milk: "Oat", size: "12 oz", reorder: "yes" }), o("2026-09-08", 7, { sweet: "0%", ice: "Warm", milk: "Oat", size: "12 oz", reorder: "yes" })] }] },
      { id: "b", name: "Tadaima Sunset", brand: "Tadaima", area: "Sunset", rating: 4, drinks: [
        { n: "Hojicha latte", orders: [o("2026-09-10", 8, { sweet: "0%", ice: "Warm", milk: "Oat", size: "16 oz", reorder: "yes" })] }] },
      { id: "c", name: "Solo Cafe", area: "Mission", rating: 5, drinks: [
        { n: "Flat white", orders: [o("2026-08-01", 5, { sweet: "25%", ice: "Hot", milk: "Whole", size: "8 oz", reorder: "neutral" })] },
        { n: "Egg coffee", orders: [o("2026-08-01", 12, { sweet: "50%", ice: "Hot", milk: "Oat", size: "8 oz", reorder: "no" })] }] },
      { id: "d", name: "Quiet Spot", area: "Richmond", rating: 3, drinks: [
        { n: "Drip", orders: [o("2026-07-01", 4, { reorder: "yes" })] }] },
      { id: "e", name: "Other Place", area: "SoMa", rating: 4, drinks: [
        { n: "Cortado", orders: [o("2026-07-05", 6, { reorder: "yes" })] }] },
      { id: "w", name: "Tadaima Next", brand: "Tadaima", wish: true, drinks: [] },
      { id: "pv", name: "Friend's Place", area: "", custom: true, rating: 5, drinks: [
        { n: "Tea", orders: [o("2026-06-01", 3, { reorder: "yes" })] }] }
    ];
    privDetail = { pv: { area: "742 Evergreen Terrace #12", lat: 21.30123, lng: -157.80456 } };
    show("stats"); renderStats();
    const body = document.getElementById("stats-body");
    const sec = t => [...body.querySelectorAll(".statsec")].find(e => e.textContent.indexOf(t) > -1);
    const card = t => sec(t) && sec(t).nextElementSibling;
    const dna = card("Drink DNA"), worth = card("Worth it"), chain = card("Chains");
    return {
      heads: [...body.querySelectorAll(".statsec")].map(e => e.textContent),
      usual: dna && dna.querySelector(".usual").textContent,
      duo: dna && [...dna.querySelectorAll(".sc-duo > div")].map(d => d.querySelector("b").textContent),
      stacks: dna && dna.querySelectorAll(".sc-stack").length,
      worthHead: worth && worth.querySelector(".sc-head").textContent,
      chainHead: chain && chain.querySelector(".sc-head").textContent,
      chainDuo: chain && [...chain.querySelectorAll(".sc-duo b")].map(b => b.textContent),
      dots: chain && chain.querySelectorAll(".sc-dots i").length + "/" + chain.querySelectorAll(".sc-dots i.w").length,
      html: [dna, worth, chain].filter(Boolean).map(e => e.innerHTML).join(""),
      overflow: body.scrollWidth > body.clientWidth
    };
  });

  eq(["Drink DNA", "Worth it", "Chains and independents"].every(t => r.heads.some(h => h.indexOf(t) > -1)), true, "Stats has Drink DNA, Worth it and Chains and independents");
  eq(r.usual, "Hojicha latte, no sugar, warm, oat, 12 oz.", "the sentence is the signature order, built from the most common value of each option");
  eq(r.duo[0], "Hojicha latte", "the most loyal order is the drink ordered most");
  eq(r.duo[1], "Egg coffee", "the biggest gamble is the priciest drink you ordered only once");
  eq(r.stacks, 4, "sweetness, ice, milk and size each get a bar of their whole spread");
  eq(/^\d+% of your drinks, you would order again$/.test(r.worthHead), true, "Worth it leads with the share you would order again (" + r.worthHead + ")");
  eq(r.chainHead, "67% independent, 33% chain branches", "chains are counted as brand groups of two or more, with the want-list branch not counted as visited");
  eq(r.chainDuo[0], "Tadaima", "the most visited brand is named");
  eq(r.dots, "3/1", "three branch dots, one of them a ring for the place still to try");
  eq(/Evergreen|21\.3|-157\.8/.test(r.html), false, "a private spot's address and coordinates never reach these cards");
  eq(r.overflow, false, "nothing sticks out at 375px");
  eq(errs, [], "no page errors");
  await ctx.close(); await b.close(); srv.close(); process.exit(done() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
