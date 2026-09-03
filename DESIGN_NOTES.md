# Design notes

Why the app is built the way it is, what the data actually supports, and what was
deliberately **not** built. Last updated 16 Aug 2026. Figures are live values from that date
and will drift — the reasoning is the durable part, the numbers are the evidence for it.

Companion to `README.md`, which covers structure and deployment.

---

## Conventions

- **No build step, no framework, no dependencies.** `index.html` is markup; `styles.css` is
  every style; `js/*.js` are classic scripts loaded in a fixed order (config → core → storage
  → nav → map → photos → list → stats → rank → detail → form → boot). Functions are globals
  because inline `onclick` handlers depend on them. This is a feature: nothing to install,
  nothing to rot, deploy is `git push`.
- **Bump `?v=` on every script and link tag in `index.html` when any `js/` or `css` file
  changes.** That is what busts browser caches *and* trips the in-app "new version" banner,
  which watches `index.html` only.
- **State lives in attributes.** `#app[data-view]` switches all six panes and
  `#app[data-mode]` drives the whole admin/viewer split through one rule
  (`[data-mode="viewer"] .admin-only{display:none!important}`). `[data-theme]` and
  `.adminbar[data-open]` follow the same pattern. Prefer extending it over adding JS
  bookkeeping.
- **Colours come from tokens**, defined in three blocks so the theme toggle can override the
  system preference in both directions: bare `:root`, `@media (prefers-color-scheme:dark)
  :root:not([data-theme="light"])`, and `:root[data-theme="dark"]`. Any new colour must be
  added to all three. `--acc` is the identity orange; `--acc-strong` is the only one that may
  sit under white text (`--acc` is 3.01:1 there, `--acc-strong` is 4.94:1).
- Map pin colours (`ratingColor`, `cafeColor`) stay literal hex — the Google Maps API needs
  real colour strings, not CSS variables.

## Traps that have already caused bugs

- **`saveForm()`'s edit branch does `Object.assign(c, data)`**, and `data.drinks` is rebuilt
  from the form rows. Anything stored on a drink row that the form does not know about is
  destroyed. This silently erased drink Elo for months. `elo`/`matches` are now explicitly
  carried across; **anything else added to a drink row needs the same treatment.**
  Cafe-level `c.elo` survives only because `data` has no `elo` key — do not add one.
- **`mergeVisitInto()` is safe** by contrast: it mutates existing drink objects field by
  field rather than replacing them.
- **`subscribeCloud()` repaints a few hundred ms after every save** by calling
  `openDetail(curId)`. Anything injected into the detail pane from *outside* `openDetail`
  gets wiped. The ranking sheet is rendered from inside it for exactly this reason, and holds
  cafe ids rather than object references so the echo cannot orphan a vote.
- **Legacy `PhotoService.GetPhoto` URLs are session-bound** and, once stale, Google serves a
  placeholder error image with HTTP 200 — so `onerror` probes cannot detect the breakage.
  `isSessionPhotoUrl()` refuses them from persisted data. Never store one.
- **The Maps key is referrer-locked** to the GitHub Pages origin, so photo fetching cannot be
  tested from localhost. Only fallbacks and error handling can.
- **`.ph` tile contents are written from three places** (`renderList`, `verifyCardPhoto`,
  `applyCardPhoto`). They all route through `phInner()`; bypassing it means a resolving photo
  silently wipes the star pill and wish badge.
- **`eloScoreNum()` returns exactly 5.0 for a never-compared cafe** — a real midpoint, not a
  null. Sorting on it alone floats every untested cafe above everything that was compared and
  lost. That shipped in List's "Top ranked" for months and put the most-compared cafe in the
  corpus in last place. Any new ordering must branch on `matchCount(c) > 0` first.
- **A button that names a destination has to be checked in both roles.** "See the board ›" and
  the Stats handoff both called `openRank()`, which opened a matchup for admin and the
  leaderboard only for viewers — so the owner could never reach the thing the button promised.
  Two callers shipped before anyone noticed.

- **The cloud node is an object keyed by cafe id, not a JSON array.** It began life as an
  array, and `save()` reshaped it the first time it ran after per-cafe writes landed. Writing
  `cafes/<id>` while it is array-shaped adds a string key beside the numeric ones and
  **duplicates the cafe**, so `saveCafe()`/`removeCafe()` refuse to touch a path until
  `_cloudKeyed` is true and fall back to a full write instead. `asArray()` reads either shape
  and the backup workflow's `jq` already collapses the object back to an array, so nothing
  else has to care — but anything new that writes to the cloud does.
- **`save()` means *all 101 cafes*.** Use `saveCafe(id)` for one and `removeCafe(id)` for a
  deletion. The full write is correct for genuinely bulk operations (`cleanupMilkNames`,
  `fetchAllPhotos`) and wrong everywhere else: two devices each writing everything means the
  second silently erases whatever the first added.
- **`sw.js`'s `CACHE_V` and the `?v=` on every script tag are the same version.** Bump one
  without the other — or neither — and the service worker keeps serving the previous build,
  which looks exactly like a change that did not deploy. This has already happened once:
  five commits changed `js/` while both sat at 25, and the fixes never reached the browser.
  `tests/cache-version.js` now fails when they disagree, and the worker revalidates in the
  background so a missed bump costs one reload rather than being permanent.
- **The photo lookup is a text search, so correcting a pin used to change nothing.**
  `fetchPlacePhoto()` queries Places with `name + area` and passed the pin only as
  `locationBias` — a hint Places may ignore. Moving a cafe to its real location therefore
  returned the same wrong photo, however thoroughly `saveForm()` cleared `c.gphoto` and the
  cache. The pin is a `locationRestriction` now, and picking a different place from
  Autocomplete updates `f-area` as well, since a stale area silently keeps the query the same.
- **`verifyCardPhoto()` deletes a cached photo whose URL will not load.** That is correct —
  stale Google URLs answer 200 with a placeholder — but it means any test using a fake photo
  URL will watch its cache empty itself. Use a real `data:image/...` URI.
- **Currency is never looked up from coordinates.** `new google.maps.Geocoder` bills against
  the Geocoding API — a separate metered API from the Maps JavaScript and Places ones this app
  uses — so there is no reverse geocode anywhere. The country arrives free from
  `address_components` for a cafe picked through Autocomplete; anything else shows the
  currency chip, and the choice is stored as `c.ccy`, which outranks `c.cc` and is only ever
  asked once per cafe. Do not reintroduce a lat/lng country guess: `countryTerms()` exists for
  search terms and puts Vancouver in the United States.
- **Everything this app writes is public.** `cafes.json` is served from the repo and the
  Firebase node is read without auth, so *hiding something in the UI hides nothing.* A value
  that must not be public cannot be written. `redactPrivate()` in `core.js` is the one place
  a record is made safe, it runs in `saveForm()` before the write, and
  `.github/workflows/backup.yml` repeats it in jq — because the backup pulls straight from
  Firebase daily and would otherwise republish a precise value the app no longer writes.
  **Change one and you must change the other.**
- **Only `locate()` may raise the browser's location prompt.** `autoLocate()` and
  `focusNearest()` both used to ask on their own — the second on *every* switch to the map
  tab. They now go through `ifLocationAlreadyAllowed()`, which fires only on a `granted`
  permission, where reading the position raises no prompt. **"Can't tell" resolves to no:** an
  older Safari with no Permissions API, or a query that throws, must not ask. Any new caller
  of `showUserLocation()` needs the same gate, and must not toast — the button owns the
  failure message because the button is the only path the user started.
- **`userMarker` is created in `drawUserLocation()` and nowhere else.** For a long time it was
  declared in `core.js`, read by `refitMap()`, and cleared by `showUserLocation()` — but never
  assigned, so the map never showed you. The dot is deliberately not in `gmarkers`: that array
  is handed to the clusterer and wiped on every `renderMarkers()`, which would swallow it.
- **A cafe's photo is found by its Google place id (`c.pid`), not by its name.** The lookup
  used to be a text search — name plus area — which is why correcting Paragon Tea Room's
  location never corrected its photo: the query was the same and it kept matching the same
  wrong shop. Two location-based fixes were attempted before the actual cause was clear,
  because the search never used the location as anything binding. Cafes saved before this
  have no `pid` and still text-search; **the fix reaches an old cafe only when its name is
  re-picked from the Autocomplete dropdown.** Dropping the pin by hand clears the `pid`,
  because a hand-dropped pin is not a claim about which Places record this is.
- **`esc()` escapes the apostrophe, and 17 inline handlers depend on that.** They pass
  arguments inside single-quoted JS strings (`onclick="openDetail('…')"`), so a cafe named
  `Joe's` would otherwise break out of one.

---

## Measured baseline — 16 Aug 2026

| | |
|---|---|
| Cafes | 94 total — 89 visited, 5 wishlist |
| Drink rows | 113, of which **58 (51%) have a price** |
| Recorded spend | $496.67 — computed over half the data |
| Visits (distinct cafe-day) | 102, across 92 distinct days since Sep 2022 |
| Return behaviour | **12 returned to, 57 visited once, 20 undated** |
| Ratings | 75 rated, **61 of them 4 or 5 stars** |
| Cafes ranked | 86 of 89, 195 head-to-heads, max 15 comparisons |
| Drinks ranked | 27 of 113, max 6 — frozen; drinks are no longer ranked |

Two consequences run through most decisions below: **prices are missing from half the
drinks**, so any money figure is a floor and needs its coverage stated; and **ratings are
squashed at the top**, so a star average cannot move and "which was better" needs a
comparison, not a score.

Cafe ranking coverage moved from 70 of 88 to 86 of 89 within a day of the post-save question
shipping, which is the clearest evidence in the file that asking at the moment of logging
works and asking on a separate screen did not.

---

## Decisions

### Photos are fetched, never trusted from storage
Session-bound Places URLs were being persisted to Firebase and served broken to everyone.
Fetching moved to the Places API (New) with the legacy service as fallback; stable URLs are
persisted by the admin "Fetch all photos" action so viewers get thumbnails at zero API cost.
Thumbnails load lazily — rendering the list costs no requests, and opening a cafe costs one.

### The precise copy lives outside `cafes`
`save()` writes the whole `cafes` array to the public node, so anything in that array is
published by definition. A private spot's exact address therefore lives in `privDetail`, a
separate map loaded from an owner-only Firebase node, and is read through `areaOf()` /
`latOf()` / `lngOf()`. **Never merge it into `cafes` to make a screen easier to write** — one
`save()` afterwards publishes it. `shareCafe()` deliberately uses `c.area` and not `areaOf(c)`
for the same reason: it sends the value to someone else.

### A private spot is blurred, not hidden
"Private spot 🏠" used to mean only "skip Google photos", while still publishing an exact pin
and a free-text area — one real record read `1800 Washington St #611`. Coordinates now round
to a 0.01° grid (~1km) and a numbered area field is dropped, at save time. Rounding rather
than random jitter is deliberate: a grid cell is stable, so re-saving lands on the same point,
where jitter moves every save and averaging a few of them recovers the location it was meant
to hide. Digits are the test for an address because a locality never needs them — "San Mateo"
survives, "Apt 4B" does not.

### You are a filled dot, wishlist is a hollow ring
The map already spent blue on wishlist pins, so the location dot is separated from them on
three axes rather than by hue: filled against hollow, saturated against pale, and carrying an
accuracy halo that nothing else has. The halo is the radius the device actually reported and
is only drawn past 25m — a 5m circle at street zoom is a smudge under the marker, and drawing
a tight ring around a vague fix would be a lie about precision.

### Which place it is, is not a search result
Every Places response carries a permanent `place_id`, and the form was discarding it and then
re-deriving the place from text later — the same mistake it was making with the country. The
id is now stored on the cafe and the photo is fetched by it directly, so there is nothing left
to match wrongly. An id that resolves with no photos means *no photo*; falling back to a search
there would be trading a blank card for someone else's storefront.

### Contrast was the real accessibility problem
Measured on white before the design pass: stars **2.01:1**, `--faint` 2.50, green 3.41, red
3.70, white-on-accent 3.01. All now clear AA (5.28–5.40). The rating renders as a same-glyph
two-colour track — `★★★★` filled plus `★` unfilled — because `☆` is optically lighter and a
different advance width, so a filled/hollow mix reads as decoration rather than a proportion.

### The edit form defaults and protects
101 of 116 drinks carry a date, so new rows default to today (timezone-corrected —
`toISOString()` alone lands on the wrong day from Hawaii or Taipei). Rows rehydrated from
saved drinks are untouched, so the dateless entries stay dateless. Existing drinks collapse to
one-line summaries so a stray tap cannot edit an old visit, and any exit with unsaved changes
asks first.

### A drink groups orders; it does not flatten their prices
The same drink can cost $6.50 in June and $7.25 in September. It remains one named drink for
search and ranking, but now carries an `orders` ledger whose rows each own their date, price,
currency, quantity, size, sweetness, ice, milk and reorder verdict. The old top-level fields
remain as a latest-order summary so older cached clients keep working.

Editing uses one collapsed card per drink and one independently editable row per order. Its
header shows order count, latest date and the observed price range; **Add another** appends a
fresh dated order instead of changing the previous one. Detail uses the same grouped card:
the compact view shows count, latest date and price range, then a tap reveals every dated order,
price, quantity, verdict and option as a timeline. Monthly and total spending sum the individual
orders. Legacy records are expanded on their next edit using the only historical price they
retained; prices overwritten before this ledger existed cannot be reconstructed.

### Stats answers a question instead of listing tables
The old screen was 3,558px across 11 sections, of which ~1,400px was provably empty: six
"drink rating" rows that all read exactly 100%, a "best value" metric that reduces to
`1/price`, and eight cards repeating seven rows from 350px above. It now leads with **"Go back
to"** — the only actionable thing in the corpus, given 56 cafes visited once and 12 returned
to — and every metric tile states its own coverage. Result: 2,198px.

### Ranking comes to the save, and ranks cafes
The Rank tab went unused. The question now appears as a bottom sheet after saving. It ranks
**cafes**, justified by the drink just logged ("Both do hojicha latte"), because:

- Replaying all 114 dated logs chronologically, a same-name **drink** opponent existed only
  **26%** of the time. 120 of the 140 possible drink pairs are hojicha-vs-hojicha.
- **Cafe** opponents exist 100% of the time, and cafe scores already spread 2.9–7.4.
- Drink confidence is `m/(m+12)` and the maximum any drink has reached is 6, so drink scores
  are pinned near 5.0 regardless of effort.

The payoff shown is **rank position, not the score**: one vote moves the displayed decimal
about 0.05 but moves rank a median of 4–5 slots. "Too close to call" is a real third answer —
with 61 of 75 rated cafes at 4–5 stars, "both good" is the most frequent honest response.

### The tab holds the standing, not the chore
⚖️ Rank became 🏆 **Board**. The old tab opened a matchup and hid the leaderboard behind
`if(!isAdmin)`, so the owner had cast 190 head-to-heads and never seen the ordering they
produced. The slot now shows the full standing to both roles; ranking on demand is a button on
it (`boardRank()`), which anchors on a never-compared cafe when one exists and reuses the same
sheet the save flow uses rather than a second comparison UI.

Positions come from `chaserRank()`, the same helper the sheet quotes, so "#2 → #1" in the popup
and "#1" on the board can never disagree. It is **competition ranking**, so genuine ties share
a position — ten tie groups today, three cafes at #14. Medals only for a unique top three. The
score renders muted at 13px rather than bold green, because it cannot bear the emphasis: #1 and
#2 both print 7.4, and six cafes print 5.4.

Stats and Board now point at each other, so neither handoff is a dead end.

---

## Rejected, and why

Recorded so they are not re-proposed. Each was considered and turned down on evidence.

- **Elo score on list cards.** 18 of 88 cafes have zero comparisons and confidence shrinks by
  `m/(m+4)`, so a third of the grid would show a confident-looking number meaning nothing. The
  fixed-corner geometry was kept and filled with the star track instead.
- **Ranking drinks after a save.** See above — 26% pairing, scores that cannot move, and until
  recently a ledger the save path erased.
- **Fixing drink pairing by normalising names.** Stripping iced/hot/size/milk words moves the
  hit rate from 33.9% to 34.8%. Matching on the first two words reaches 46% but pairs "Matcha
  latte" with "Matcha Matcha". The corpus is genuinely long-tail.
- **Merging `normDrink` keys.** Hojicha spans 11 keys across 13 spellings. `normDrink` is what
  the ranking sheet's exact-twin tier matches on and what `cleanupMilkNames` collapses on, so
  merging changes which pairs get offered. Stats and the sheet's family tier sidestep it
  instead, which is why the sheet can say "Both do hojicha" across spellings.
- **An SVG icon sprite.** ~15 symbols and ~30 replacement sites to buy stroke consistency,
  with no effect on the logging loop and a real cost to the homemade character. The genuine
  problem it named — semantic drift between glyphs — was fixed with four glyph corrections.
- **Colour-coding tiles by drink family.** 64 of 88 cafes are coffee, so three quarters of
  every screen would collapse into four browns.
- **A day-of-week chart.** Visits are Sun 15 / Mon 16 / Tue 16 / Wed 14 / Thu 20 / Fri 16 /
  Sat 17 — a flat line.
- **A stars-vs-Elo "disagreement" section.** Ranked by the naive gap, the top entries are all
  5★ cafes with 3–6 comparisons whose Elo still sits near the default. It would rank "cafes I
  haven't compared much" and call it disagreement.
- **A segmented control on Stats.** 72px of permanent chrome to navigate 2,313px of content.
  Navigation was the right answer at 3,558px and the wrong one after the cuts.
- **A floating search bar over the map.** It repurposed `.sidebar` — simultaneously the
  container for the header, admin bar, sort row and every pane — as a transparent overlay for
  one view. Unshippable incrementally.
- **Deleting the location dropdown.** Search only helps if you already know the name; this is
  the one browse-by-place affordance across nine countries. Deferred for replacement, not
  deletion.
- **Retuning the Elo confidence divisors.** Cosmetic — widening a divisor rescales the same
  ordering, and a first win still renders 5.1. Showing rank position is the actual fix.
- **The liked-tally badge on cards.** The live distribution is all-yes or all-no in every
  non-zero case, so the denominator carried no information.
- **A drinks leaderboard on the Board.** Deleted with the old tab. It contradicted itself in
  public: Mashio Project's Hojica latte was the #2 drink in the app while Mashio Project the
  cafe was #45 of 70, both numbers produced by the same screen.
- **Deleting the ranking tab outright.** The raised ＋ would have shifted to 62.5% of the tab
  bar — a permanent every-launch geometry change paid to remove a screen — and a ranked list of
  94 cafes is the most shareable thing the app produces. Hiding it in the sort `<select>` next
  to "Recently updated" is the wrong home for it.

---

## Open threads

- **The "Go back to" hero uses a hardcoded San Francisco origin** (`CA_HOME`), inherited from
  the old "farthest travelled" section. On a trip it will keep suggesting Bay Area cafes.
  Preferring the map's live geolocation with `CA_HOME` as fallback is the fix.
- **Drink Elo erased before 16 Aug 2026 is unrecoverable.** The leak is fixed, but every
  `cafes.json` snapshot postdates the loss. 22 cafes kept their scores, and the detail page
  still shows them; nothing writes new ones.
- **`#map-sub`** ("N cafes · tap a pin") no longer renders anywhere, since both title bars are
  hidden on mobile. Map errors still surface through the full-pane `#map-msg`.
- **Remaining scale drift:** 19 font sizes and 15 border radii across the stylesheet. Worth
  folding in opportunistically, not worth a project.
