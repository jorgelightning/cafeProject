/* Runs every test file and reports one line each. Exit code is non-zero if anything failed,
   so this works as a pre-push check. Add a file to tests/ and list it here. */
"use strict";
const { spawn } = require("child_process");
const os = require("os");
const path = require("path");

const SUITE = [
  ["unit",             "the pure helpers in js/lib/ (escaping, URLs, spelling distance, dates, Elo, placement, an order's words), by Node alone"],
  ["cache-version",     "the deploy versions agree and a stale build cannot pin itself"],
  ["currency-units",   "conversion, rounding and the country->currency table (no browser)"],
  ["currency-form",    "logging a drink in local money, end to end"],
  ["order-prices",     "same drink keeps separate dated prices"],
  ["drink-taps",       "tap controls preserve optional drink attributes"],
  ["order-editor",     "editing dates above history preserves separate purchases"],
  ["drink-notes",      "a drink's ⋯ puts a note, tags and 👍 😐 👎 on its newest cup; shown under the drink, kept by Edit, merged by sync"],
  ["quick-cup",        "a cup on one sheet (same as last time, last price, 👍 😐 👎) and Tidy up's one-cafe-at-a-time gaps"],
  ["barista",          "Show the barista: What to order's last cup on the whole screen in the counter's language, English under each word, the screen kept on"],
  ["free-cups",        "a cup logged at 0 reads Free on the cafe page and in local money, Tidy up and No price take it as a price, averages still skip it"],
  ["shortcuts-pace-price","the icon's long-press Log a cup, Near me and Want to try; Wrapped's year on pace; the quick cup's price among every like cup"],
  ["tips",             "reader tips: off without a reCAPTCHA key; a visitor's tip from Go or a search that found nothing, cleaned to the rule; the owner's inbox, Want to try and Dismiss"],
  ["visitor-view",     "a visitor gets Directions/Hours/Share up top, one word instead of a rank, =N ties, Stats in Jorge's name, one Cupertino"],
  ["go-filters",       "Go by kind and region, Best coffee, a no-match search that suggests, Near me refused offers regions"],
  ["welcome",          "a first visit says whose list it is, once per device, never for the owner or over a shared cafe"],
  ["rank-pairs",       "Rank a pair asks never-compared, then placing, then ties; same kind and region preferred"],
  ["compare-kind",     "the question after a save stays in one kind (a stand-in when short, none when alone), asks a nearby place you remember, shows both drinks and kinds, and a kind can be set"],
  ["ui-system",        "one header and back button, one chip, drawn drink marks, one-line options, one word for visitors, a readable List, a pill that follows the map, Near me"],
  ["design-batch",     "the design audit: the List row steps aside on scroll, one Log button, the map opens on the busiest part, gear and sliders, Go in one row, drinks by most ordered, button weights, five sizes and three weights"],
  ["day-run",          "the day run: Log opens the cafe you are in, the nearest branch first with the street, a Maybe is never What to order, the usual asks no question and better pairs, a readable rank"],
  ["share-pages",      "a shared link is /c/<id>, a page per public cafe that previews as it and forwards; 404.html for new ones"],
  ["site-build",       "the published site: only the app's files and all they load, the data checked for private details, and minified JS and CSS that keep every name and still run"],
  ["audit-upgrades",   "stable order editing, compact layout and Stats origin"],
  ["currency-source",  "where a cafe's currency comes from, and that nothing is metered"],
  ["rates-dated",      "the rate for the day a drink was ordered"],
  ["rates-network",    "fetching a real rate, caching it, and every way it can fail"],
  ["wishlist-form",    "wishlist position and which fields it hides"],
  ["wishlist-save",    "wishlist drops the visit, and warns before deleting real history"],
  ["wishlist-drinks",  "a cafe with drinks logged comes off the wishlist"],
  ["cloud-writes",     "per-cafe writes, deletion, and the lost update they prevent"],
  ["rules",            "database.rules.json is the rule the app needs, and the README and config.js copies agree (npm run test:rules puts it to the emulator)"],
  ["private",          "a private spot never publishes an exact location or a street address"],
  ["keyboard",         "every control is reachable and activatable without a pointer"],
  ["locate",           "the locate button, its states, and the user dot it draws"],
  ["relocate",         "correcting a cafe location moves its area and its photo with it"],
  ["place-id",         "a cafe's photo is fetched by place id, not by searching its name"],
  ["usuals",           "logging a drink you have had before, without retyping it"],
  ["audit-fixes",      "the 16 Sep audit fixes: durable private writes, rule probe, folded form"],
  ["sync-conflict",    "telling two versions of a cafe apart when they collide"],
  ["board-guide",      "the board reads as a guide, and its bookkeeping stays with the owner"],
  ["sync-merge",       "two devices merge automatically, and what it refuses to merge"],
  ["sync-auto",        "edits sync with no Retry: a cafe saved mid-sync goes in the same pass, and a failed sync tries again by itself (timer, reconnect, back on screen)"],
  ["scale",            "one type/radius/space scale, and a layout that fits all three devices"],
  ["css-shape",        "styles.css states each selector once per context (no rule appended to override another), and !important stays rare"],
  ["list-clean",       "the list tint carries the rating, and four control rows fold into one"],
  ["settings",         "one home for the preferences, and a map error that stays in the map"],
  ["beli",             "three buckets, a position on every card, and the two lists up front"],
  ["stats-charts",     "cadence heatmap, price spread and taste split: SVG only, no location, no spend total for viewers; colours by meaning, ordered DNA, the collection line, the price strip, regulars' strips, places' bars"],
  ["list-guide",       "one-tap guides for a friend, quick views and + log again for the owner, price on the order line, two columns at 375"],
  ["share-card",       "what to order leads the cafe page, a gold rank tile, option pills, and a postcard that never carries a private place"],
  ["stats-wrapped",    "drink DNA, worth it, and chains against independents: counted from the data, no place read"],
  ["map-pins",         "pins scale with the zoom into pills that give way to each other, and the legend is a ? on a laptop"],
  ["shared-link",      "a shared link opens the map on its cafe, and redrawing the pins never moves a map someone placed"],
  ["rank-placement",   "a new cafe is placed by a search among its own verdict, K is per cafe, and the tier is a prior not a wall"],
  ["list-rows",        "the List is rows with sticky landmarks by default; no + on a card; the photo cards are a layout choice"],
  ["stats-tabs",       "Stats is three tabs (You, Habits, Money); the owner's spend is in Money only; no emoji in headings"],
  ["wide-screens",     "the calmer screens at iPad Mini, laptop and large widths: nothing sticks out, rows are two columns on a tablet, charts stop at 520px"],
  ["a11y",             "text contrast on ten screens in both themes, scrims over a white photo, and a keyboard walk: every stop has a ring and a name"],
  ["perf-budget",      "the Go board, List and Stats ask for a score a bounded number of times, and the one-pass rank map agrees with the per-cafe walk"],
  ["wrapped-strip",    "the Wrapped strip on Stats > You: counts, the 20-visit floor, viewers, no area/review/money, Share"],
  ["more-menu",        "the cafe page ⋯ menu closes on a choice, an outside tap, Escape and opening another cafe"],
  ["postcard-mark",    "the postcard is a 9:16 Story: a drawn vessel in the drink's colour chosen from what the place serves, nothing in the unsafe bands, no 'open in the app'"],
  ["smart-mark",         "the guessed mark on tiles, the cafe page, the Go queue and in search; a chosen emoji always wins"],
  ["stories",            "the year and top 5 as 9:16 Stories: five best ranked, no private or wishlist cafes, safe band, owner-only button"],
  ["data-copy",          "Settings' Your data card: Download a copy, what it holds, the backup date, and the unsynced flag untouched"],
  ["same-cafe",          "the same-cafe check at logging: spelling, case and a branch suffix no longer hide a duplicate; branches stay separate"],
  ["sync-resolve",       "answering a sync conflict decides only the fields that clashed; both devices' visits survive either answer"],
  ["private-hardening",  "no place id on a private spot (app and backup), no exact address left in the browser after sign-out, verdict in the score cache"],
  ["redesign",         "one visual language: drawn marks everywhere, line icons on every control, content first on Go, three button styles, one drink rule"],
  ["updates",          "a new build applies itself when nobody is mid-use, and can never loop"],
  ["peek",             "a pin on a phone opens a card over the map, and the map stays put"],
  ["want-pins",        "want-to-try pins you can find, and a switch that shows only them"],
  ["map-bubbles",      "zoomed-out bubbles: want-to-try as a violet tag that never covers the number, a 4px ring, the World view in the same bubble, biggest on top, and the you-are-here dot under the bubbles with a blue mark on yours"],
  ["csp",              "a Content Security Policy with no inline script: the page keeps to it, it names every host, every screen runs under it, and gstatic scripts are pinned by hash"],
  ["hardening",        "the 14 Oct audit: head tags, one heading, no passphrase, safe ids, local clusterer"],
  ["discovery",        "verdict and area filters, empty states, skeleton, order-again, SVG tab bar"],
  ["overflow-375",     "nothing sticks out and nothing is under 12px on any screen at 375px"],
  ["lazy-photos",      "a long list requests photos as cards near the screen, not all at once"],
  ["world",            "the World view: bubbles per region, a list, no grey, pins back on a tap"],
  ["brand-auto",       "brand / chain detection: names, the form never overriding you, a non-destructive backfill"],
  ["branches",         "branch chip and list on the cafe page, the form's brand chip, + Branch, sibling usuals"],
  ["one-screen",       "logging a new cafe fits one phone screen, in counter order"],
  ["boot-firebase",    "the app starts against a connected, real-shaped Firebase"],
  ["offline",          "the app boots with the network pulled"],
  ["regression",       "101 real cafes still render exactly as before"]
];

/* Four at a time (engineering audit, 27 Oct). Every file starts its own server on a free port and its own browser,
   so nothing is shared between them; one after another the suite took 5 to 6 minutes. Output is held per file and
   printed in suite order, so a run reads the same as before. TEST_JOBS=1 runs them one at a time. */
const JOBS = Math.max(1, parseInt(process.env.TEST_JOBS || "", 10) || Math.min(4, os.cpus().length));
function runOne(name) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(__dirname, name + ".js")], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", d => (out += d));
    child.stderr.on("data", d => (out += d));
    /* a test that hangs is a failing test — it must never wedge the run */
    const timer = setTimeout(() => {
      out += "  TIMED OUT after 120s\n";
      child.kill();
    }, 120000);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ ok: code === 0 && !signal, out });
    });
  });
}

(async () => {
  const results = new Array(SUITE.length);
  let next = 0,
    printed = 0;
  const flush = () => {
    while (printed < SUITE.length && results[printed]) {
      const [name, what] = SUITE[printed];
      process.stdout.write("── " + name + "  " + what + "\n" + results[printed].out + "\n");
      printed++;
    }
  };
  const worker = async () => {
    while (next < SUITE.length) {
      const i = next++;
      results[i] = await runOne(SUITE[i][0]);
      flush();
    }
  };
  await Promise.all(Array.from({ length: JOBS }, worker));

  /* A file that failed gets one more run, alone. If it passes then, it is named as flaky instead of failing the
     suite: a real failure fails twice and stays red, and a timing-sensitive test is named every time it wobbles,
     so it can be fixed rather than shrugged at. */
  const flaky = [],
    failed = [];
  for (let i = 0; i < SUITE.length; i++) {
    if (results[i].ok) continue;
    const name = SUITE[i][0];
    const again = await runOne(name);
    if (again.ok) flaky.push(name);
    else {
      failed.push(name);
      process.stdout.write("── " + name + "  (run again, alone)\n" + again.out + "\n");
    }
  }
  if (flaky.length) console.log("flaky (failed, then passed alone): " + flaky.join(", "));
  if (failed.length) {
    console.log("FAILED: " + failed.join(", "));
    process.exit(1);
  }
  console.log("suite green — " + SUITE.length + " files, " + JOBS + " at a time");
})();
