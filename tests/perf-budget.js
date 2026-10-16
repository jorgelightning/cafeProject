/* A cost ceiling for the screens that touch every cafe.

   Wall-clock timing is a flaky thing to assert, so this counts work instead: how many times a screen asks for a
   cafe's score. The Go board used to rank each row by walking the whole board (111 rows x 111 scores, about
   12,000 calls, 49ms, 215ms on a slow phone); it uses the one-pass rank map now. A screen that goes quadratic
   again will blow through these ceilings long before a person feels it. The positions must not change. */
const { serve, launch, checker } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await pg.waitForTimeout(900);

  const r = await pg.evaluate(() => {
    isAdmin = true; applyMode();
    const real = window.eloScoreNum;
    let calls = 0;
    window.eloScoreNum = function (c) { calls++; return real(c); };
    const count = fn => { calls = 0; fn(); return calls; };
    const n = chaserBoard().length;
    const out = { n };
    calls = 0;
    out.board = count(() => { show("compare"); renderBoard(); });
    out.list = count(() => { listCompact = true; sortMode = "ranked"; show("list"); renderList(); });
    out.stats = count(() => { _statsTab = "you"; show("stats"); renderStats(); });
    window.eloScoreNum = real;
    /* the rank map and the per-cafe walk agree on every position, ties included */
    const board = chaserBoard(), rm = rankMap();
    out.disagree = board.filter(c => rm[c.id] !== chaserRank(c, board)).length;
    show("compare"); renderBoard();
    const shown = [...document.querySelectorAll("#cmp-body .lbrow.guide .lbrank")].map(e => e.textContent.trim());
    out.shown = shown.length;
    out.firstThree = shown.slice(0, 3);
    return out;
  });
  const budget = 12 * r.n;
  eq(r.n > 50, true, "there is a real board to measure (" + r.n + " ranked)");
  eq(r.board <= budget, true, "the Go board asks for scores " + r.board + " times, under " + budget + " (it was about " + r.n * r.n + ")");
  eq(r.list <= budget, true, "the List asks " + r.list + " times, under " + budget);
  eq(r.stats <= budget, true, "Stats asks " + r.stats + " times, under " + budget);
  eq(r.disagree, 0, "the one-pass rank map gives every cafe the position the per-cafe walk does, ties included");
  eq(r.shown, r.n, "…and every ranked cafe still has a row on the board");
  eq(r.firstThree.length, 3, "…with a medal or number on the first three");
  eq(errs, [], "no page errors");
  await ctx.close(); await b.close(); srv.close(); process.exit(done() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
