# Tests

The app is plain static files with no build step, and these tests keep it that way: they
drive the **real** `index.html` in a real browser against the **real** `cafes.json`. There is
no mock of the app itself. What is stubbed is only what cannot be reached from a test
machine — Firebase, the Google Maps key (referrer-locked to the Pages origin), and the
exchange-rate endpoint.

The `App checks` GitHub workflow runs the suite on pushes to main and pull requests.
`audit-upgrades.js` covers layout, stable order IDs, false discard prompts and Stats origin.

## Running them

```bash
npm install                      # once — pulls Playwright
npx playwright install chromium  # once — the browser it drives
npm test                         # the whole suite
node tests/keyboard.js           # or one file
```

If Chromium is already on the machine — a CI image that ships one, or a Playwright whose
pinned build has drifted from what is installed — point at it instead of downloading a
second copy:

```bash
CHROMIUM_PATH=/path/to/chromium npm test
```

Nothing here is needed to *deploy*. GitHub Pages serves the static files and ignores
`package.json` and `node_modules/` entirely.

## What each file covers

| File | What it protects |
|---|---|
| `currency-units.js` | Conversion, rounding, the country→currency table. No browser — it lifts the currency block out of `core.js` and runs the arithmetic directly. |
| `currency-form.js` | Logging a drink in local money, end to end, including the `saveForm()` traps. |
| `order-prices.js` | Same-named drinks keep independent date, price and quantity history through form edits and Stats. |
| `currency-source.js` | Where a cafe's currency comes from, and that **nothing calls a metered API**. |
| `rates-dated.js` | A drink converts at the rate for the day it was ordered, and a saved rate is never recalculated. |
| `rates-network.js` | Fetching a real rate, caching it permanently, and all three ways it can fail (offline, HTTP error, switched off). |
| `wishlist-form.js` | Where the wishlist tick sits and which fields it hides. |
| `wishlist-save.js` | A wishlist entry saves no visit, and ticking it on a cafe with real history asks first. |
| `wishlist-drinks.js` | A cafe with drinks logged comes off the wishlist. |
| `cloud-writes.js` / `sync-queue.js` | Persistent pending edits, cloud snapshot reconciliation, conflict decisions, per-cafe transactions, legacy migration, deletion and failure handling. |
| `place-id.js` | A cafe's photo is fetched by its Google place id, not by searching its name. The wrong-photo bug. |
| `private.js` | A private spot never publishes an exact location or a street address — at save, in `cafes.json`, and in the daily backup. Also: the offline private-save audit (saved copies kept in memory, a save that never moved the pin cannot overwrite the real address, a newer address from another device is kept). |
| `usuals.js` | Logging a drink you have had before: the one-tap shortcut, the near-match guard, and the cleanup for names already split by a typo. |
| `audit-fixes.js` | The 16 Sep audit fixes: a refused private write survives, the rule probe, the folded form, update-prompt contrast. |
| `sync-conflict.js` | Telling two versions of a cafe apart when they collide: what differs, and which is newer. |
| `board-guide.js` | Every board row carries its reason (place and drink on two lines, the note and bookkeeping behind a chevron), and the ranking bookkeeping stays with the owner. |
| `sync-merge.js` | Two devices merging automatically — and every case where it must refuse and ask instead. Also: id-less legacy orders merge, null/undefined/[]/{} read as absent, deterministic order ids. |
| `scale.js` | The type/radius/space scale is the whole set, and all three device widths get a sane layout. |
| `list-clean.js` | The placeholder tint carries the rating with legible ink, and four control rows fold into one. |
| `settings.js` | Appearance, list layout, editing mode and the admin actions share one screen, with the maintenance count on the door; a Maps failure no longer paints over the whole app. |
| `beli.js` | The ranking is the spine: three buckets instead of five stars, a position on every card, been/want as the two lists, and Stats opening with the collection. |
| `stats-charts.js` | Stats gains a cadence heatmap with streak and weekday split, a price spread with monthly trend, and a verdict ring with wishlist and tags. All inline SVG on theme tokens, no location in the markup, nothing sticking out at 375px, and the running spend total is owner only. |
| `list-guide.js` | A viewer gets four one-tap guides (Top 10, Best tea, Go-to, Near me) and a search box that counts the spots; the owner gets Recent, Unranked and Needs price inside Filters plus a + that opens that cafe's visit with its usual drink. Price on the order line, two columns at 375px, Near me never asks for location on its own. |
| `share-card.js` | The cafe page leads with what to order (drink, price, count, last date, and Log again for the owner), the top ten get a gold rank tile, a drink's options read as pills and the note as a quotation. Share spot draws a 1080x1350 postcard, sends it as a file where the device can and as a download where it cannot, and builds it from the public area so a private spot's place never travels. |
| `stats-wrapped.js` | Stats shows the whole spread of sweetness, ice, milk and size as bars under the signature order, the most loyal order and the biggest gamble; a Worth it card from the reorder verdicts; and chains against independents from the same brand groups the cafe page uses. A private spot's place never reaches them. |
| `map-pins.js` | A visited pin is a small dot zoomed out, a larger one in between and a pill with the cafe's emoji and name close in; a pill that would cover a better-ranked cafe's gives way to a dot, the picked cafe always keeps its label, want-to-try pins are never touched, and on a laptop the legend is a 44px ? above the locate button. |
| `rank-placement.js` | A cafe with fewer than five comparisons is provisional and is placed by a search among established cafes of its own verdict (median first, then ever smaller steps); each cafe moves by its own K; a well-compared cafe scores exactly as before; the verdict is a prior (a Loved cafe scores above a Fine one at the same thin Elo) and not a cap; the board lists what is still being placed, for the owner only. |
| `list-rows.js` | With no saved choice the List is rows (name, place and time, then the order and its price, the rank at the right in gold for the top ten); sticky bands follow the sort (Top 10 / 11 to 30 / 31 to 60, This week / This month); none while searching, inside a guide or in the photo layout; no card carries a +; a placeholder tile is a soft wash. |
| `stats-tabs.js` | Stats is three tabs: You (Drink DNA, Taste), Habits (monthly activity, cadence, regulars, where you go, chains) and Money (price spread, worth it, and for the owner what was spent). One panel shows, a bad tab name changes nothing, a viewer never sees the total spent, no heading carries an emoji, nothing sticks out at 375px. |
| `wide-screens.js` | Eight screens at 744, 1280 and 1600px: nothing sticks out and no page errors; on an iPad the List rows are two columns with bands spanning both, a chart stops at 520px instead of scaling its text, and a lone stat card takes the whole row. |
| `a11y.js` | Every text colour against what is really behind it (layers composited, opacity applied) on ten screens in the light and dark theme: 4.5:1, or 3:1 when large. The round buttons and rank badges are held to their worst case, a white photo. A Tab walk through the List: every stop shows a focus ring and has a name, and no tabindex is positive. |
| `perf-budget.js` | A cost ceiling by counting work, not milliseconds: how many times the Go board, the List and Stats ask for a cafe's score (12 per ranked cafe at most), and that the one-pass rank map gives every cafe the position the per-cafe walk does, ties included. |
| `wrapped-strip.js` | The strip of year cards at the top of You: this year's visits, cafés (new ones counted), your drink (casing folded), where you went back, busiest month and how you take it, ending on Share. Shows from 20 visits, never counts the wishlist or last year, reaches viewers, and carries no area, review or money, in the cards or in the shared text. Dots follow the scroll; both Share buttons clear 44px. |
| `more-menu.js` | The ⋯ menu (Edit, Delete) on the cafe page: choosing Edit no longer leaves it open to float over the page when you return; it also closes on Delete (even declined), a tap anywhere else and Escape (focus back on the button), and when another cafe opens. A tap on its own panel does not close it. |
| `postcard-mark.js` | The postcard is 1080 x 1920 for Instagram Stories. What a place serves picks the mark (bowl, cup, boba, gelato, pastry; the drink you order most beats the name, a chosen emoji beats the guess), drawn in cream line art on a fade in the drink's colour. Nothing is typed as an emoji, there is no "open in the app", every line of text stays below the top 14% and above the bottom 13% even for a long name, drink and note, and the preview leaves the Share button on screen on a small phone. |
| `updates.js` | A new build reloads itself before anything is touched, waits behind the bar when you are mid-use or mid-form, and can never loop. |
| `peek.js` | On a phone a pin slides up a card — rank, verdict, what to order, Directions — without leaving the map; the back button and a map tap put it away. On a laptop a pin still opens the page beside the map. |
| `want-pins.js` | Want-to-try pins are violet with a white edge and a bookmark, sit above visited pins and cluster bubbles, and are never clustered; the map's Want to try switch hides visited pins without refitting the map, and the Want tab's map button turns it on. |
| `hardening.js` | Link-preview and PWA meta, one `<h1>` exposed on every device, emoji kept out of button names, no shared passphrase, ids that could break an inline handler never rendered, the map clusterer is a vendored file. |
| `discovery.js` | Verdict and area filters that combine with the type chip and search, a live "N of M" line and one Clear, the map button sharing the same filter; empty states that explain and offer the next step; the list skeleton; "Order again" on the cafe page; the drawn tab bar. |
| `overflow-375.js` | Every screen at 375px: no sideways scroll, no element past the edge, no text under 12px. |
| `lazy-photos.js` | 60 cards with photos: only those near the screen are requested and set; scrolling loads more; no IntersectionObserver falls back to loading everything. |
| `one-screen.js` | A new visit is name, place line, drink and price, verdict, note, More, Save — one phone screen instead of 3.4. The place line says what Google filled in; More says what it holds even when shut. |
| `keyboard.js` | Every control is reachable and activatable without a pointer, against all 101 real cafes. |
| `locate.js` | The locate button, its three states, the user dot — which was never being drawn — and that **nothing but the button raises the permission prompt**. |
| `world.js` | The map never opens on the whole globe: it opens on the region nearest you (or the biggest), with a zoom floor, an ocean-coloured background and no poles. "World" gives one numbered bubble per region with a list under it, on request. A row (or the dropdown) brings the pins back. |
| `brand-auto.js` | A cafe's chain is told from its name — location suffix stripped, other cafes' spelling, a seed list, a shared name. The form fills the brand only while you have not decided it; the backfill only fills empty brands and has a dry run. |
| `branches.js` | The chip and list that replace the cafe page's branch row — 44px rows, whole labels, a capped scrolling list, switching in both roles, `＋ Add branch` for the owner only — and the form's brand chip (Edit, Unlink, link again), the new-branch badge, and sibling drinks offered first. |
| `boot-firebase.js` | The app starts against a connected Firebase that behaves like the real one — no nulls stored, `set()` throws on `undefined` — as owner (early and late sign-in) and visitor; nothing the private side does can stop the map or editing mode. |
| `offline.js` | The app boots with the network pulled. |
| `regression.js` | Legacy drink prices render identically; a form round-trip adds order history without changing existing summary fields. |

`regression.js` is the one that encodes a promise rather than a behaviour: the currency work
shipped without migrating the ~60 dollar prices already on record, and that is only safe for
as long as those drinks render exactly as they used to. A drink that *does* carry a local
currency is expected to differ — it gains its second line. If that test goes red, either the
promise broke or the promise changed; be sure which before editing it.

`snapshot.js` is a tool rather than a test. It dumps the exact HTML that `renderList()`,
`openDetail()` and `addDrinkRow()` produce — every sort mode, every filter, both roles, all
101 cafes, plus synthetic edge cases — so a refactor can be proved to change nothing:

```bash
node tests/snapshot.js before.json    # before touching anything
node tests/snapshot.js after.json     # after
diff before.json after.json           # must be empty
```

## Why they exist

They are not decoration. In the session that produced them they caught, among others:

- three emoji written as `\U` escapes that JavaScript read as the literal text `U0001F4CD` —
  two of them invisible to the snapshots because they were set via `textContent`
- a helper rewritten to call **itself** instead of `localStorage`, so every write silently
  failed while appearing to succeed
- `syncWishMode()` deleted by a removal whose range was one function too wide
- an update bar in `index.html` left keyboard-inaccessible because a grep only scanned `js/`
- a `userMarker` that every part of the app referred to and nothing ever created
- two location-based fixes for a wrong cafe photo that could not have worked, because the
  photo was never looked up by location — it was looked up by name

Every one of those looked safe when written.

## Adding one

Copy the shape of any existing file. `harness.js` gives you three things:

```js
const { serve, launch, checker, ROOT } = require("./harness");
const srv = await serve();     // the repo over http, on an OS-assigned port
const b   = await launch();    // chromium
const { eq, done } = checker(); // eq(got, want, label); done() -> true if green
```

Then add it to the `SUITE` list in `run.js`. Two conventions worth keeping: assert on
**behaviour a user would notice** rather than on internals, and when you fix a bug, add the
case that would have caught it.
