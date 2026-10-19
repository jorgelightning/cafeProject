/* Runs every test file and reports one line each. Exit code is non-zero if anything failed,
   so this works as a pre-push check. Add a file to tests/ and list it here. */
"use strict";
const { spawnSync } = require("child_process");
const path = require("path");

const SUITE = [
  ["cache-version",     "the deploy versions agree and a stale build cannot pin itself"],
  ["currency-units",   "conversion, rounding and the country->currency table (no browser)"],
  ["currency-form",    "logging a drink in local money, end to end"],
  ["order-prices",     "same drink keeps separate dated prices"],
  ["drink-taps",       "tap controls preserve optional drink attributes"],
  ["order-editor",     "editing dates above history preserves separate purchases"],
  ["audit-upgrades",   "stable order editing, compact layout and Stats origin"],
  ["currency-source",  "where a cafe's currency comes from, and that nothing is metered"],
  ["rates-dated",      "the rate for the day a drink was ordered"],
  ["rates-network",    "fetching a real rate, caching it, and every way it can fail"],
  ["wishlist-form",    "wishlist position and which fields it hides"],
  ["wishlist-save",    "wishlist drops the visit, and warns before deleting real history"],
  ["wishlist-drinks",  "a cafe with drinks logged comes off the wishlist"],
  ["cloud-writes",     "per-cafe writes, deletion, and the lost update they prevent"],
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
  ["scale",            "one type/radius/space scale, and a layout that fits all three devices"],
  ["list-clean",       "the list tint carries the rating, and four control rows fold into one"],
  ["settings",         "one home for the preferences, and a map error that stays in the map"],
  ["beli",             "three buckets, a position on every card, and the two lists up front"],
  ["stats-charts",     "cadence heatmap, price spread and taste split: SVG only, no location, no spend total for viewers"],
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

let failed = [];
for (const [name, what] of SUITE) {
  process.stdout.write("── " + name + "  " + what + "\n");
  /* a test that hangs is a failing test — it must never wedge the run */
  const r = spawnSync(process.execPath, [path.join(__dirname, name + ".js")],
                      { stdio: "inherit", timeout: 120000 });
  if (r.signal === "SIGTERM") console.log("  TIMED OUT after 120s");
  if (r.status !== 0 || r.signal) failed.push(name);
  process.stdout.write("\n");
}

if (failed.length) {
  console.log("FAILED: " + failed.join(", "));
  process.exit(1);
}
console.log("suite green — " + SUITE.length + " files");
