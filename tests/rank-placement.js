/* Placing a new cafe on the board, instead of nudging it with Elo.

   A cafe with one comparison sat near 5.0 whatever it had beaten, because (a) it was paired with whichever
   cafe had the fewest comparisons, so two near-blank cafes met and learned nothing, (b) its Elo was shrunk
   by 80% towards the middle of the board, and (c) a veteran beating a newcomer cost the newcomer about five
   points while a newcomer beating a veteran moved both by twenty-two: K came from the winner alone.

   Now a cafe with fewer than five comparisons is PROVISIONAL. It meets established cafes of its own verdict
   as a search — the median first, then a quarter of the way up or down, and so on — and its Elo is its
   position in that search, so nothing new is stored on a cafe. Established cafes keep ordinary Elo, each
   side at its own K. The verdict is a prior (a provisional cafe is shrunk towards its tier's average),
   not a wall. tests/beli.js still pins the scores and positions of well-compared cafes. */
const { serve, launch, checker, ready } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await ready(pg);

  /* a board: 36 established Loved cafes, 10 Fine, 4 Not for me — spaced evenly, so a position is easy to read */
  const setup = () => pg.evaluate(() => {
    isAdmin = true; applyMode(); _chaser = null; _chaserSeen = []; _priorSig = -1;
    let seed = 99; Math.random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    cafes = [];
    for (let i = 0; i < 36; i++) cafes.push({ id: "L" + i, name: "Loved " + i, rating: 5, elo: 1700 - i * 8, matches: 8, drinks: [] });
    for (let i = 0; i < 10; i++) cafes.push({ id: "F" + i, name: "Fine " + i, rating: 3, elo: 1480 - i * 6, matches: 8, drinks: [] });
    for (let i = 0; i < 4; i++) cafes.push({ id: "M" + i, name: "Meh " + i, rating: 1, elo: 1400 - i * 6, matches: 8, drinks: [] });
    return cafes.length;
  });
  await setup();

  // ---- the arithmetic ----
  const m = await pg.evaluate(() => ({
    k: [0, 1, 2, 3, 4, 5, 30].map(n => kFor({ matches: n })),
    never: eloScoreNum({ id: "x", rating: 5, matches: 0 }),
    prov: [isProvisional({ matches: 4 }), isProvisional({ matches: 5 })],
    /* a well-compared cafe scores exactly as it always did: 5 + (elo-1500)/45 * m/(m+4) */
    steady: +eloScoreNum({ id: "q", rating: 5, elo: 1600, matches: 12 }).toFixed(3),
    expect: +(5 + (100 / 45) * (12 / 16)).toFixed(3)
  }));
  eq(m.k, [40, 34, 28, 22, 16, 16, 16], "K is the cafe's own and falls with its comparisons, to a floor of 16");
  eq(m.never, 5, "never compared is still exactly 5.0, a midpoint with no position");
  eq(m.prov, [true, false], "a cafe is provisional for its first four comparisons");
  eq(m.steady, m.expect, "a well-compared cafe scores exactly as before, so established positions do not move");

  // ---- who a new cafe meets ----
  const pair = await pg.evaluate(() => {
    cafes.push({ id: "N", name: "New Loved", rating: 5, drinks: [] });
    chaserArm("N");
    const first = cafes.find(x => x.id === _chaser.opp);
    const refs = placementRefs(cafes.find(x => x.id === "N")).map(x => x.id);
    return { tier: _chaser.tier, opp: first.id, bucket: bucketOf(first), mid: refs.indexOf(first.id), n: refs.length };
  });
  eq([pair.tier, pair.bucket], ["P", "loved"], "a new Loved cafe is placed against a Loved reference, not whoever has the fewest comparisons");
  eq(Math.abs(pair.mid - pair.n / 2) <= 1, true, "…the one in the middle of the tier to start (position " + pair.mid + " of " + pair.n + ")");

  const step = await pg.evaluate(() => {
    const n = cafes.find(x => x.id === "N"), start = _chaser.opp;
    chaserApply(n.id, start, false);                 // it wins
    _chaser = null; chaserArm("N");
    const second = placementRefs(n).map(x => x.id).indexOf(_chaser.opp);
    return { second, n: placementRefs(n).length, matches: n.matches };
  });
  eq(step.matches, 1, "an answer counts as a comparison");
  eq(step.second < 18, true, "after a win the next opponent is higher in the tier (position " + step.second + " of " + step.n + ")");

  // ---- the update is symmetric in K, and a placement barely moves the reference ----
  const sym = await pg.evaluate(() => {
    const a = cafes.find(x => x.id === "F0"), c = cafes.find(x => x.id === "F1");
    a.matches = 10; c.matches = 30; a.elo = 1500; c.elo = 1500;
    chaserApply("F0", "F1", false);
    return { a: a.elo - 1500, c: c.elo - 1500 };
  });
  eq(sym, { a: 8, c: -8 }, "two established cafes each move by their own K (16): the same, whoever won");
  const ref = await pg.evaluate(() => {
    const q = cafes.find(x => x.id === "L10"), before = q.elo;
    const n2 = { id: "N2", name: "Another", rating: 5, drinks: [], matches: 1, elo: 1600 }; cafes.push(n2);
    chaserApply("N2", "L10", false);
    return { moved: Math.abs(q.elo - before) <= 12, placed: n2.elo };
  });
  eq(ref.moved, true, "a reference barely moves when a newcomer is placed against it");

  // ---- the search converges, which is the point ----
  const sim = await pg.evaluate(() => {
    const out = { err: [], top: null, bottom: null };
    for (let t = 0; t < 24; t++) {
      cafes = cafes.filter(x => !/^(N|N2|T\d+)$/.test(x.id)); _chaser = null; _chaserSeen = []; _priorSig = -1;
      const q = 1700 - (t / 23) * 35 * 8;              // a true quality somewhere in the Loved range
      const c = { id: "T" + t, name: "Trial " + t, rating: 5, drinks: [] }; cafes.push(c);
      for (let k = 0; k < 5; k++) {
        chaserArm(c.id);
        const opp = cafes.find(x => x.id === _chaser.opp);
        const win = q > eloFor(opp);
        chaserApply(win ? c.id : opp.id, win ? opp.id : c.id, false);
        _chaser = null;
      }
      const refs = cafes.filter(x => /^L/.test(x.id)).map(eloFor).sort((a, b) => b - a);
      const got = refs.filter(e => e > eloFor(c)).length, want = refs.filter(e => e > q).length;
      out.err.push(Math.abs(got - want));
    }
    return out;
  });
  const mean = sim.err.reduce((s, x) => s + x, 0) / sim.err.length;
  eq(mean <= 4, true, "five consistent answers put a new Loved cafe within " + mean.toFixed(1) + " places of where it belongs, among 36");
  eq(Math.max.apply(null, sim.err) <= 8, true, "…and never worse than 8 places off (" + Math.max.apply(null, sim.err) + ")");

  // ---- the verdict is a prior, not a wall ----
  const wall = await pg.evaluate(() => {
    cafes = cafes.filter(x => !/^T/.test(x.id)); _chaser = null; _chaserSeen = []; _priorSig = -1;
    const c = { id: "W", name: "Rated Fine, beats everyone", rating: 3, drinks: [] }; cafes.push(c);
    for (let k = 0; k < 5; k++) {
      /* a Fine cafe searches among borrowed references only if its tier is too thin; make it meet Loved ones */
      const top = cafes.filter(x => /^L/.test(x.id)).sort((a, b) => eloFor(b) - eloFor(a))[Math.min(k, 3)];
      chaserApply(c.id, top.id, false);
    }
    return { elo: eloFor(c), topRef: Math.max.apply(null, cafes.filter(x => /^L/.test(x.id)).map(eloFor)) };
  });
  eq(wall.elo > 1400, true, "enough wins can carry a Fine-rated cafe up the board (to " + wall.elo + "); the verdict starts it, it does not cap it");

  // ---- tiers pull a provisional cafe to its own verdict ----
  const prior = await pg.evaluate(() => {
    cafes = cafes.filter(x => !/^(W|T|N)/.test(x.id)); _priorSig = -1;
    const loved = { id: "P1", name: "P1", rating: 5, elo: 1500, matches: 1, drinks: [] };
    const fine = { id: "P2", name: "P2", rating: 3, elo: 1500, matches: 1, drinks: [] };
    cafes.push(loved, fine);
    return { loved: eloScoreNum(loved), fine: eloScoreNum(fine) };
  });
  eq(prior.loved > prior.fine, true, "with one comparison a Loved cafe scores above a Fine one at the same Elo (" + prior.loved.toFixed(2) + " vs " + prior.fine.toFixed(2) + "), not both on 5.0");

  // ---- the board tells the owner what is still being placed ----
  const board = await pg.evaluate(() => {
    cafes = cafes.filter(x => !/^(P|W|T|N)/.test(x.id));
    cafes.push({ id: "Z", name: "Barely compared", rating: 5, elo: 1510, matches: 2, drinks: [] });
    isAdmin = true; applyMode(); renderBoard();
    const own = document.getElementById("cmp-body").textContent;
    isAdmin = false; applyMode(); renderBoard();
    const vis = document.getElementById("cmp-body").textContent;
    return { own: /Still placing — 1/.test(own) && /Barely compared/.test(own), viewer: /Still placing/.test(vis) };
  });
  eq(board, { own: true, viewer: false }, "the owner sees a short 'Still placing' queue on the board; a visitor never sees the bookkeeping");

  eq(errs, [], "no page errors");
  await ctx.close(); await b.close(); srv.close(); process.exit(done() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
