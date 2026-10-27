# Design notes

Why the app is built the way it is, what the data actually supports, and what was
deliberately **not** built. Last updated 9 Sep 2026. Baseline figures below are from 16 Aug 2026
and will drift — the reasoning is the durable part, the numbers are the evidence for it.

Companion to `README.md`, which covers structure and deployment.

---

## Conventions

- **No build step, no framework, no dependencies.** `index.html` is markup; `styles.css` is
  every style; `js/*.js` are classic scripts loaded in a fixed order (config → core → storage → sync
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

- **Firebase `set()` THROWS synchronously on an `undefined` anywhere in the value** — it is not
  a rejected promise, so `.catch()` does not see it. And Firebase stores no nulls, so a missing
  field comes back absent (`undefined`), not `null`. Normalise before comparing, strip before
  writing. This blanked the map on 29 Sep (v61).

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
- **A private address is written to the cloud AFTER the public copy has been blurred**, so a
  refused write used to destroy the only precise copy there was. `savePrivateDetail()` now
  mirrors it on the device and queues a retry, and the refusal is toasted rather than left in
  `console.warn`. **Do not reduce that back to a fire-and-forget write.**
- **The rules in `js/config.js` and `README.md` must stay identical.** They disagreed once —
  config.js documented the pre-private set — and because Realtime Database denies any path no
  rule grants, following it made private spots silently unwritable.
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

### A drink you order everywhere needs a shortcut that is not per-cafe
"Log again" is built from `drinkIndex()`, which counts every drink across every cafe. Scoping
it to the cafe on screen would have been the obvious move and would have been useless: a cafe
you have logged before already renders each drink as a group with its own "＋ Add another"
button. The case with no shortcut at all is a cafe you have *never* been to — and that is
exactly where a whole-history index still knows the answer.

One tap has to produce a finished order, not a head start: `usualSpec()` fills in the options
you pick most for that drink, and focus lands in the price field because price is the only
part that genuinely differs per cafe.

### The typo guard asks, and must never correct
`nearestDrinkName()` is deliberately strict — a proportional cap as well as an absolute one,
and nothing under five characters — because the map is full of names one keystroke apart that
are **different drinks**: `Matcha latte - Saemidori` and `- Samidori` are two cultivars,
`Hojicha latte (Snoopy version)` is its own thing. Auto-correcting any of those would destroy
real records silently. The same rule governs `spellingFixPlan()`, which additionally requires
the surviving spelling to outnumber the variant 3:1 before it will even propose a merge.


### September audit improvements
- Public cafe edits and deletions are persisted in `cafemap.outbox.v1` before sending. Incoming
  snapshots overlay pending edits. Transactions compare against the original cloud record;
  conflicting cafe versions require an explicit choice. Per-cafe acknowledgments cannot clear
  another pending edit. Old dirty snapshots are recovered conservatively, with conflict review.
- The sync queue is for public cafe records. Owner-only precise-location storage remains separate;
  it is never copied into the public queue. Keep that boundary when extending offline support.
- Order IDs persist on save; the form preserves them. Dirty detection ignores visual row order.
- The complete editor is more compact, with every milk type in a selector and all tap controls retained.
- Compact cafe rows are optional; the grid stays available. Last-visited dates come only from orders.
- Stats distances identify the selected origin. No automatic location prompt is introduced.
- The shell precaches `cafes.json` so the first completed install has an offline data fallback.
- `App checks` runs the suite on pushes and pull requests. Fixture screenshots use portable paths.


### Photos are fetched, never trusted from storage
Session-bound Places URLs were being persisted to Firebase and served broken to everyone.
Fetching moved to the Places API (New) with the legacy service as fallback; stable URLs are
persisted by the admin "Fetch all photos" action so viewers get thumbnails at zero API cost.
Thumbnails load lazily — rendering the list costs no requests, and opening a cafe costs one.

### The admin bar is collapsed, so pending work has to announce itself
`.abactions` is `display:none` until the bar is opened, and the cleanup buttons only appear
when there is something to clean. That combination made them undiscoverable: you had to open a
panel to find out the panel had anything in it. A count now rides on the closed toggle.

### One scale, and glyphs are not type
Colour was tokenised from the start; nothing dimensional was, so the stylesheet reached 23 font
sizes, 18 corner radii and 13 gap values — seven font sizes inside three pixels. `--fs-1..5`,
`--r-1..4`/`--r-pill` and `--sp-1..5` are now the whole set, and `tests/scale.js` fails if any
rule sets a literal radius or gap.

**Font size has one deliberate exception.** Emoji and icon glyphs — the raised ＋, the 34px star
widget, the empty-state marks — are artwork being sized, not type being set, and forcing them
onto a text scale would be wrong. The test allows a literal size on those selectors and on no
others.

### The layout has three sizes, not two
One breakpoint at 900px meant a 744px iPad ran the phone layout stretched to double width, and
a 1440px laptop drew **128px cards where a 390px phone drew 173px** — the browse column was
pinned at 400/440px while the grid went from two columns to three at the same breakpoint. The
column is now `clamp(400px, 33vw, 660px)`, the grid is `auto-fill minmax(168px, 1fr)` so the
count follows the space, and 700–899px gets a reading width. **Map chrome positions off
`--sidebar`**, so anything pinned to the sidebar edge must use `calc(var(--sidebar) + 12px)`
rather than a literal.

### Stats stopped recommending
Stats carried its own recommender — a "Recommendations around" picker driving a "Go back to"
card — which measured from a hardcoded San Francisco whenever nothing was chosen. The guide
does this properly now, from your real location, so the picker, the card, `statsArea`,
`heroNext` and `statsLocate` are gone. **The origin it computed is still needed** by "Where you
go" for the farthest-cafe line, so `CA_HOME` survives as `userLoc || DEFAULT_CENTER` — no
hardcoded city.

What went with it, in case it is wanted back: the card surfaced cafes rated 4★+, **visited
exactly once, and not returned to in 45+ days** — a different question from "what is good near
me", and one nothing else in the app asks.

### The guide leads with what you can reach
A standing whose top entry is 6,000 miles away is a list of places you cannot go. When
`userLoc` is known the same ranking splits into "Near you" (within `NEAR_MI`, 25) and "Further
afield" — **ordering inside each group stays the standing**, so it reads as the best places
nearby rather than the closest ones. Nothing is hidden; the far group is still there, labelled.

Two rules it must keep: the guide **never raises the location prompt on its own** — with no
location it shows a tap that calls `locate()`, the only path allowed to ask — and somewhere
with nothing close by names the nearest cafe and its distance rather than rendering an empty
screen. `showUserLocation()` re-renders the board when it is the visible view, so the grouping
appears the moment the fix lands.

### The Board is a guide; the ranking is bookkeeping
A row used to read "#1 · name · 11 comparisons · area · 7.4" — a visitor was given the
ranking's bookkeeping and none of the 88 ratings, 87 drink records or 84 written notes already
stored against these cafes. Rows now carry stars, the drink to order (counted by orders, not by
record), and the owner's own sentence. **No photo:** photos are fetched lazily on the detail
page so Places costs one lookup per cafe *viewed*, and 102 rows would invert that — the emoji
tile stays.

The comparison count, the Elo score, the "places are provisional" caveat and the
"Never compared" queue are all `isAdmin`-only now — **and so is the Stats handoff**, which
leaked the same coverage count ("102 of 104 cafes ranked") from a different pane. They describe work only the owner can do.
**`.lbrow` is shared with the stats leaderboards**, so the guide layout is scoped to
`.lbrow.guide`; styling `.lbrow` alone restyles Stats too.

### Two devices merge; only a real disagreement asks
A conflict used to mean "the cloud copy is not byte-identical to the one I started from",
which fires whenever two devices touch *different* fields of the same cafe — the ordinary case.
`syncMerge()` uses the `base` the outbox already captures: a field only one side moved is taken
from that side, and only the same field moved differently on both sides is a conflict.

Orders merge by id, so two devices each logging a drink at the same cafe combine instead of
colliding. **A single id-less order anywhere makes the whole drinks list all-or-nothing** —
legacy records predate ids and merging those by position would reshuffle prices between dates.
New orders always get an id, so this heals as records are edited.

`elo`/`matches` follow whichever side has seen more comparisons and never raise a conflict;
`updated` takes the later stamp. **Every doubt resolves to "ask":** a wrong merge loses an edit
silently, a needless question costs one tap. Deleting on one side while the other edits is
always a question.

Reconciliation happens on open and on `visibilitychange`, not only on edit and `online` —
a phone resuming from background often does not fire `online`, which left a queue stuck.

### A conflict has to say what changed, not just that something did
"Another device edited this cafe — choose which version to keep" is unanswerable in the moment
it appears: a conflict happens *while you are editing*, and both options described a place
rather than a change. The outbox entry already holds both versions, so the panel now diffs
them field by field and stamps each side with how long ago it was touched — minute
granularity, because `chaserWhen()`'s "today" cannot separate two edits ten minutes apart.
Only fields a person would recognise are compared; when none of them differ it says so rather
than asking the same unanswerable question again.

### The app checks its own database rules
The private node is only private if a rule says so, and that rule is published by hand in a
console where nothing in the app can see it. `probePrivateRule()` asks from the outside: a
second, unauthenticated Firebase app reads `private/`. Auth state is per app instance, so this
poses the question as a stranger would even while the owner is signed in. A rule that works
**rejects** that read; one that resolves — with data or with null — proves the path is
world-readable. Read-only on purpose: proving the database is writable would mean writing to it.
*(Superseded 29 Sep, v60 — see "Who can change the map" below: the probe now asks about writes
too, without writing anything.)*

### The form folds to the part you came for
Adding a cafe needs every field; revisiting one needs almost none of them. Location, area,
brand, photo and tags sit in one `<details>` that opens for a new cafe and stays shut for an
edit, taking the revisit path from 1,471px to 715px on an 844px screen. The catch worth
remembering: **Google sizes a map when it is created, and a map created inside a closed
`<details>` has no size to measure** — the toggle handler re-runs `mapResize()` and re-centres.

### The precise copy lives outside `cafes`
`save()` writes the whole `cafes` array to the public node, so anything in that array is
published by definition. A private spot's exact address therefore lives in `privDetail`, a
separate map loaded from an owner-only Firebase node, and is read through `areaOf()` /
`latOf()` / `lngOf()`. **Never merge it into `cafes` to make a screen easier to write** — one
`save()` afterwards publishes it. `shareCafe()` deliberately uses `c.area` and not `areaOf(c)`
for the same reason: it sends the value to someone else.

### A private spot is blurred, not hidden
"Private spot 🏠" used to mean only "skip Google photos", while still publishing an exact pin
and a free-text area — one real record held a street address with an apartment number. Coordinates now round
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
The active order moves above collapsed history, with its full set of editable attributes.
Order dates use a visible full-width native date input plus Today, Yesterday and Clear.
Opening a historical order moves that same row into the editor; it never copies or replaces
another purchase. Done collapses the editor; Save visit commits all pending edits.
Size uses −/+ taps in 2 oz steps; sweetness uses presets plus a custom percentage;
ice/temperature uses labeled tap choices. These replace sliders so vertical phone scrolling
cannot drag a value. Values remain unset until selected, and Clear removes a selection.

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

### The List screen: colour with a job, and one control row

Two measurements drove this. **111 of 111 cards** render a placeholder — photos are only
fetched when a cafe is opened, so the tile colour *is* the List screen for a first-time
visitor — and `cafeColor()` picked that colour by hashing the cafe's name into eight
saturated hues, spread 18/17/16/14/14/13/10/9. Two cafes with nothing in common came out
identical; a 5★ and a 1★ came out different for no reason a reader could name. And the
controls above the grid ran to **four stacked rows** — search 51px, chips 54px, a count
beside a sort menu 34px, a layout toggle alone on its own row 44px — **217px on a 390×844
phone**, 26% of the screen, before a single cafe appeared.

The tint now carries the **rating**, on the same five-step scale the map pins already use
(`ratingColor()` in `map.js`), so the two screens agree and the colour is worth reading.
`cafeColor()` is deleted — it had no other callers.

Three of the five steps are too light for white text: white on the amber step is 1.98:1
against a 3:1 large-text floor. So the ink follows the tint's luminance instead of being
fixed. `inkOn()` computes WCAG relative luminance and flips to `rgba(0,0,0,.72)` above
**L = 0.30** — the exact point where `1.05/(L+0.05)` drops below 3. All six tints clear the
floor: 3.41, 8.38, 10.44, 7.59, 3.70, 7.95. `nophotoStyle()` returns background and ink
together, because they can never travel separately.

The four control rows fold into one `.listbar` — count, a **Filters** button, the map button
— with the chips, the sort menu and the layout toggle inside a `.listpanel` that is closed at
rest. Nothing is removed. The button carries a count of what is on, which is why
`activeFilterCount()` deliberately does *not* count the default sort: a badge only means
something if it matches what a person would call a filter. Measured against the real 111
cafes, chrome went **217px → 109px** — 108px recovered, about two more cafes above the fold.

Guarded by `tests/list-clean.js` (29 assertions), which checks the contrast arithmetic rather
than the hex values, so retuning the palette stays safe.

### Preferences get a screen of their own

Theme lived in two places and behaved differently in each. On a laptop, `🌗 Theme: auto` was
the fourth button in the side nav, 106×46px — the other three navigate, this one mutated state
in place, and it was the only one whose label changed under you. On a phone it was an
unlabelled `🌗` in the List search bar that cycled auto → light → dark **blind**: you learned
where you landed from a toast. It cost 40px of a 372px bar, and it was reachable from the List
tab and nowhere else.

There is now a Settings pane — the same pattern Detail, Go and the form already use — holding
Appearance, list layout and editing mode. A single `⚙︎` opens it, in place of **both** the
theme cycler and the lock pill, in all four places those appeared (List search bar, map
overlay, desktop side head, desktop side nav). The search input goes 212px → 260px, and
Settings is reachable from Map as well as List, which the theme control never was.

The controls are segmented rather than cycling: three named states, each one tap away, the
current one visibly on and carrying `aria-pressed`. `cycleTheme()` is deleted.

Two consequences worth knowing. **Signing in to edit is now two taps** rather than one — that
was the accepted cost, chosen deliberately over keeping a second button in the chrome; the
side nav's `＋ Log a visit` and the admin bar still make the mode obvious at a glance. And the
list layout toggle moved out of the Filters panel, so `activeFilterCount()` stopped counting
it — it was never a filter, and a badge only means something if it matches what a person would
call one.

The version line reads the `?v=` off the `boot.js` script tag the browser actually loaded,
rather than a hard-coded string that would drift on the next bump. "Am I on the new build?" is
the question it exists to answer.

The admin bar went in with them. It was a collapsed `⚙︎ Admin ▾` strip on the List pane — a
second gear, three rows above the new one, holding the bulk maintenance actions. Its actions
are now an admin-only card in the same screen, and its buttons went from 30px tall to 44px on
the way (part of the outstanding U3 finding).

What the strip did well was **announce itself**: the count rode on the closed toggle, because
an action that only appears when there is work to do is invisible the rest of the time. Moving
the actions behind a door would have thrown that away, so the count moved onto the door — every
settings gear carries it, on the List and on the Map, and the icon-only ones put it in their
`aria-label` too ("Settings, 3 to tidy"). A viewer never sees it.

`#sync-status` deliberately stayed where it is, in the sidebar above the panes. It is a live
status with a retry button and a conflict review, not a preference — it needs to be visible
while you work, not behind a door.

### A map failure used to blank the whole app

Found while measuring the above. At laptop width the sidebar is `position:absolute; z-index:2`
over a full-window `.mapwrap`. Every piece of map chrome is offset past it — `.mapsearch`
(`left:calc(var(--sidebar) + 12px)`), `.maplegend` and `.locbtn` (right-anchored). Two were
not: `.map-msg` (`inset:0`, z-index **5**) and `.rulewarn` (`left:12px; right:12px`, z-index
**8**). Both outrank the sidebar.

So whenever Google Maps failed to load — a dropped connection, an expired key, an ad blocker —
its full-pane error painted over the header, the nav, the search box and all 111 cafes.
`document.elementFromPoint` returned `#map-msg` everywhere in the browse column. Nothing on
the left half of the screen could be clicked, and the only way out was a reload. It had been
true at every desktop width since the split view was built.

Both now start where the map does. Guarded in `tests/settings.js`, which asserts what
`elementFromPoint` returns at the header, nav, search box and grid — the harness aborts every
cross-origin request, so the Maps failure the bug needed is the default state there rather
than something to simulate.

### The ranking becomes the spine

The comparison engine had been here for months — the Go tab force-ranks cafes with Elo, and a
sheet asks you to compare right after you save. What was missing is that **nothing else on
screen knew about it**. Four changes, all of them about surfacing what was already computed.

**Five stars became three buckets.** 75 of the 90 rated cafes sat on 4★ or 5★ and only five on
1–2★, so for three quarters of the app the star said nothing. The input is now *Loved it /
It was fine / Not for me* — the coarse call a comparison ranking wants, with the fine order
coming from comparing. **Nothing was migrated**: it is still stored as a rating, and 4 and 5
both read as loved, 3 as fine, 1 and 2 as not-for-me. New saves land on a canonical 5 / 3 / 1.

One consequence worth stating: `ratingColor()` went from five steps to four, so most tiles are
now the same green. That is the point — the colour carries the judgement, and the **rank badge**
carries what separates one loved cafe from another. It is also why the star run left the tile:
repeating the tile's own colour said nothing twice.

**Position goes everywhere.** `chaserRank()` existed but was owner-only and buried on Go.
`rankMap()` now builds every position in one sorted pass — `chaserRank` walks the whole board
per cafe, which is fine for one detail page and quadratic across 113 cards. Competition
ranking, so a tie shares a position and the next one skips. A cafe nobody has compared gets
**no** badge: sixteen of them share the untouched 5.0, and numbering that is a lie.

This is deliberately *not* Beli's big number out of 10. On this data 104 of 113 cafes print a
score another cafe also prints, the score takes only 29 distinct values, and 16 print exactly
5.0. A position is the one number that is actually a given cafe's own.

**Been and Want to try became the two lists.** The wishlist was one chip among seven, two taps
deep behind Filters, and "the list" silently mixed 106 places you had been with 7 you had not.
They are tabs now. A row of their own cost 62px of a 390px phone, so they went *into* the
control row instead and the separate "106 cafes" label came out — the tab's own count made it
redundant. Viewer chrome is unchanged at 121px; admin wraps to 155px because the sync note
does not fit beside them, and that wrap is now declared rather than accidental.

`wishOnly` is gone. It and `listTab` could drift apart the moment anything but `setListTab`
wrote either one, and four places did.

**Stats opens with the collection** — cafes, countries, visits, drinks, then what you actually
order — before any chart. All of it was already computed. `cafeCountryName()` falls back to
`"Other"` for a cafe whose coordinates match no country box, and six real ones do, so the
count excludes it: **5 countries, not 6**.

Guarded by `tests/beli.js` (36 assertions).

### Every drink starts collapsed

The newest drink opened itself on arrival (`open = di === 0`). On the cafe where it cost the
most — Kissaten HiFi, five drinks — that pushed everything below it **479px** down, more than
half a phone screen, so the note and the tags were off the page when you landed. Constance Tea
& Matcha paid 139px, Molly Tea 41px.

All of them start shut now. Nothing is lost at a glance: the summary line still carries the
drink, how many you have ordered, the latest date and the price range. The order timeline is
the part you go looking for, so it is the part behind a tap.

Guarded in `tests/order-prices.js`, which checks a three-drink cafe rather than one card — the
single-card case was never the one that hurt.

### Updates apply themselves

The detection was already good: `checkForUpdate()` fetches the page with `cache:"no-store"`
and a `?_chk=` buster that the service worker deliberately lets through, every 45 seconds and
whenever the app returns to the front. What it did with the answer was show a bar and wait for
a tap — so until that tap, the phone ran whatever it had, and "is it live?" kept turning into
"nvm, refreshing showed it".

It now reloads itself at the one moment a reload is invisible: **before anything has been
touched since the app came to the front** — at launch, and every time you switch back to it.
Any `pointerdown`, `keydown`, `wheel` or `touchstart` means someone is using it, and then the
bar appears as before; the update lands the next time you come back. A dirty form blocks it
entirely, bar or no bar.

Two guards. An automatic reload that lands on the same mismatch — a half-finished deploy, a
CDN still serving the old page — would loop, so there is **one automatic reload a minute**
(`sessionStorage`); after that it falls back to the bar. A tap on the bar always goes through.

And a bug fixed on the way: the first check used to become the baseline for "current". A phone
that booted from the offline cache and then came online adopted the **new** page as current
and never offered the update at all. It now compares the `?v=` on the `boot.js` tag the browser
actually executed against the one in the fetched page. Byte comparison stays as the fallback.

`tests/updates.js` fakes a new build by answering the version check with the real page, its
`?v=` rewritten. Run against the old `boot.js`, four of its assertions fail — including that
the old code did not even raise the bar in the offline-boot case.

### The three defects from the 22 Sep review

**One country count.** Go printed "6 countries" while Stats printed "5" for the same data at
the same second — each screen had its own tally and only Stats knew that `"Other"` (the
fallback for a cafe whose coordinates match no country box; six real ones) is not a country.
`countryCount()` in map.js is now the only count, used by both, so they cannot disagree again.

**The score pill stays whole.** `.scorebadge` is an inline span with a background; a long area
name (Zen Gelato's is 44 characters) wrapped the meta line *through* it, painting the pill as
two separate boxes. `white-space:nowrap` — it moves to the next line as one piece. The test
pins the property, not just the rect count, because where the break lands depends on the exact
text: a seed that wraps *before* the pill passes with or without the fix.

**Stats stopped repeating itself.** The profile band added on 21 Sep duplicated the vitals
cards 300px below it — 106 printed three times and 128 twice in the first screen. The "Cafes
visited" and "Visits" cards are gone; the facts only they carried (days out since the first
visit, the wishlist count) moved into the fact line under the band, and "N ranked head to
head" went with nothing to replace it, since it repeated the cafe count. The four figures also
sit on one row now (`flex:1 1 0`) instead of wrapping 3+1 with the last stretched alone.

A test-harness find on the way: `tests/beli.js` had been running its post-form assertions
against a hidden pane — the form widget block left the form dirty, and every later `show()`
stalled on a discard-confirm that Playwright silently dismisses. Every existing assertion was
DOM-only, so nothing noticed until the first geometry assertion returned an empty rect.

### The review's four choices, taken together

**The cafe page header** stopped being a middot run-on. Each fact owns an element: the
position is the block you see first (`#1 / of 107`, cannot wrap), the judgement and the place
share one line with the place truncating rather than pushing, and the score dropped to a
caption in plain words — it is bookkeeping, and 104 of 113 cafes share theirs with another.
This supersedes the `scorebadge` nowrap fix from three days earlier: the badge itself is gone.

**The obvious stopped being said twice.** On Go, the bucket pill appears only when a row
breaks the pattern — a fine or a not-for-me sitting in the ranking — because on a best-first
list, 90 "Loved it" pills with 3 distinct values said nothing the position didn't. The green
tile went with it (it repeated the pill, which repeated the rank), and the width it freed goes
to the note, the one thing on the row you cannot get anywhere else. On Want to try, "No visit
date" (the definition of the tab, printed seven times, truncating every area to "West San
Jose · No vis…") and the bookmark badge (the tab *is* the bookmark) are gone. The wishbadge
left `phInner()` entirely: since been/want became tabs, every card that would carry one sits
on the tab that already says it.

**The laptop map steps aside — shipped in v55, REVERTED in v57.** The reasoning was sound on
paper (475px of content beside 965px of map, charts included), but the owner tried it for two
days and asked for the panel back: "I really like having the side panel with the map when I go
between Go, Stats and Settings." The always-there map is a *preference*, not an oversight —
`tests/scale.js` now pins the persistent split on all four screens and says so in its comment,
so this does not get re-proposed as an improvement.

**The 44px touch floor, met everywhere.** The settings gear (40), the map button (34), the
tabs and Filters (36), the Settings back arrow (40), the sign-in button (41) and the
rule-warning dismiss (34) all sit at 44+ now. It cost 8px of List chrome (129 → 137, against
the original 217) and the floor wins that trade; the budget in `tests/list-clean.js` says so
in its own comment.

### The sync audit — 27 Sep 2026

Every interleaving of offline edit, cloud edit, reload mid-flush, re-edit mid-flight and
conflict resolution was traced. Most of the engine held up under it: the per-entry base
capture, the replay-safe transaction body ("the last run is the one that counts"), the
mid-flight replacement rebase, and the form's `formSyncBase` are all correct as written.
Five things were not.

**Two silent data-loss paths in the merge** — both violations of the file's own contract
("every doubt resolves to ask"). The removal rules were unconditional: `removal wins`, at the
order level and the drink level alike. So a visit logged on this phone vanished, silently,
when the other device had deleted the drink it was logged on; and a price corrected here
vanished when the other device had deleted that order. Both reproduced live before fixing.
The rule is now: **a removal beats an untouched copy, never an edited one** — an edited one is
a question, and the provisional value keeps this phone's copy until it is answered.

**A full localStorage broke instead of inconveniencing.** `syncPersist()` ran unguarded inside
the Firebase snapshot callback, so a quota throw killed the rest of the handler and the screen
silently stopped following the cloud; `queueCafe()` rethrew, aborting the caller mid-save; and
`resolveSyncConflict()`'s `_localSave()` could die between deleting the pending entry and
persisting. All three are guarded now: the entry stays in memory, the cloud write still goes
out, and the banner says to keep the page open. The localStorage mirror is a cache, not the
store — the outbox and the cloud are what protect an edit.

**Choosing "use the cloud's" left `syncRemote` stale.** The resolution now records the cloud's
copy as what the cloud has, refreshes an open detail page, and backs out of one that no longer
exists.

Pinned in `tests/sync-merge.js` (six edit-vs-delete cases, both directions, clean deletes
still clean) and `tests/sync-queue.js` (storage-full save neither throws nor stops the
listener and still reaches the cloud; resolving with the cloud updates the remote mirror).

### Fewer screens between you and the drink — 27 Sep 2026 (v58)

Measured first: the two things done most are logging a visit at the counter and browsing the
map to pick where to go, and both travelled further than they needed to.

**The map kept its place, but only for the dropdown.** `mapJumped` (now `mapOwned`) was set
by the location dropdown and nothing else, so dragging or zooming the map did not count as
choosing a view — and every return from a cafe page snapped it back to where you stood. It is
now set by any pointerdown, wheel or touch on the map, by the dropdown, and by a pin tap. The
locate button still re-centres on purpose (it passes `force`) and hands the map back to
following you. `tests/locate.js` has the four cases; the last two failed on v57.

**A pin on a phone opens a card, not a page.** Tapping a pin swapped the whole screen for the
cafe page, so looking at five pins was five trips there and back. `#peek` slides up over the
map instead: position (`#N of M`, only once ranked), the verdict pill or "Want to try",
area and distance, the most-ordered drink, and Directions / Open cafe. A map tap, another pin,
the back button or any `show()` puts it away; the locate button lifts above it and the legend
steps aside while it is up. **Laptop unchanged** — there the cafe page already opens in the
side panel beside the map, which is exactly what the owner asked to keep on 27 Sep.
`tests/peek.js`.

**A new visit fits one phone screen.** The form was 2,424px (3.4 screens): drinks started
1,180px down and "How was it?" 2,120px down, because a new cafe opened the details — map, area,
brand, photo, tags — between the name and the drink, and picking the place from Google had
already answered most of it. 71 of 85 dated cafes were visited once, so this was the common
path. Now, in the order you know things at the counter:

- **Cafe name**, then a **place line** (`#f-details` summary) that says what is known —
  "Little Russia · from Google", "Tokyo · pinned by you", or "No location yet" — and opens
  onto the pin and area only to change them. Shut for new and edited cafes alike.
- **Drinks.** The first drink of a first visit is a **quick row**: name and price on one line,
  with "Today · size, sweetness, ice, milk ▸" as the one tap to the full row. A second drink
  folds the quick one to its normal header, never to nothing.
- **How was it?**, **the note**, then **More** (`#f-more`): wishlist, private, brand, photo,
  tags, favourite. Shut, its summary names whatever is set ("Favourite · Tadaima · 2 tags",
  "Want to try"), so nothing ticked is ever out of sight.

The cost, said to the owner up front: the wishlist tick is one tap further. Two things pay
it back — adding from the **Want tab** ticks it and opens More (title "Add a place to try"),
and editing a wishlist place opens More so it is plain why there are no drinks. The form is
711–733px at 390×844. `tests/one-screen.js`; `audit-fixes.js`, `wishlist-form.js`,
`wishlist-save.js` and `drink-taps.js` were updated where they pinned the old layout (each
says why in place).

**The drink-photo box is gone (v59).** The owner never used the paste-an-image-link field:
"junk … because I don't need to use it." Removed from More along with `renderPhoto()` and
`onPhotoUrl()`. A photo already on a cafe (`c.photo`) is **kept**: `formPhoto` still carries it
through the form, and it still wins over the Google photo on the card (`gphotoFor`). There is
just no way to add a new one by hand; cards use the Google photo fetched by place id.
`tests/one-screen.js` pins both halves.

### Who can change the map — 29 Sep 2026 (v60)

The map is public to view and personal to edit, so the one thing that has to be true is that
nobody but the owner can write. The README's rules say so; nothing checked that the *live*
rules match. The container these changes are made in cannot reach the database host (network
policy), so the check lives where it can: the owner's own browser.

**The probe now asks about writes, without writing.** The earlier refusal — "proving the
database is writable would mean writing to it" — was right about writing *data*, but deleting a
key that does not exist is still a write the rules must judge, and when it is allowed it
changes nothing: no data, no events on the owner's listener. The signed-out `ruleprobe` app
now sends three: `cafes/__rulesprobe`, `private/__rulesprobe` and `__rulesprobe` at the root,
each `set(null)`. A resolve is proof (RTDB resolves only on the server's acknowledgement); a
rejection, or no connection, says nothing. The banner names the worst finding first — "Anyone
can edit or delete your map", else "Strangers can write to your database" for an open root or
private node — plus the private-read line when that also applies, and points at README → Rules.

**Only the owner's browser probes.** It used to run at boot for every visitor, and only the
banner was owner-gated — so visitors sent probes for nothing, and on a first sign-in the answer
could land before `isAdmin` was set and be dropped. It now waits for `isAdmin`, and `initAuth()`
runs it the moment the owner signs in.

**What it cannot see:** a rule like `".write": "auth != null"` lets *any* signed-in Google account
write; only a signed-out stranger is simulated here. That case needs the rules text itself,
which the owner was asked to paste from Firebase console → Realtime Database → Rules.

`tests/audit-fixes.js` pins every case: all refused is silent; every write is a `null` to a
`__rulesprobe` key from the probe app; each finding's wording; a viewer sends nothing; first
sign-in runs it. Nine of those failed on v59.

**The live rules, reviewed — 29 Sep 2026 (v61).** The owner pasted them. `cafes` is readable
by all and writable only by the owner's email: strangers and other accounts cannot change the
map, and the v60 probe agrees (it stays silent). Two gaps:

- **No `private` block.** This is the pre-private rule set the "must stay identical" trap above
  warns about. Realtime Database denies what no rule grants, so every private/ read and write —
  the owner's included — is refused. Private spots' exact locations were living only on the
  device that entered them.
- **No `email_verified` check.** Low risk with Google as the only sign-in provider, but it is the
  documented guard and costs one clause.

The first gap had a worse consequence than lost backups. `healPrivateSpots()` wrote private/
first and only then blurred the public record, so under these rules **it never blurred
anything**. Two private spots saved before v30-Aug's blurring had not been edited since
(`updated` July/August), so their precise records — one with a street address and unit number
in `area` — were most likely still world-readable in `cafes/`. The backup could not show it,
because the backup workflow blurs on the way in.

Fixed in the app regardless of the rules: the heal now keeps the exact copy through
`savePrivateDetail()` (device mirror + retry queue, pushed to private/ once the rule exists)
and publishes the blurred record through `saveCafe()` without waiting. It runs only in
editing mode, and waits rather than dropping the heal if found earlier. A refused private
read or write now also raises the rules banner ("Your private spots are not backed up"), not
just a toast. `tests/private.js` §10b replays the live rules; five of its checks failed on v60.

**The repo is public.** The address and exact coordinates were also in the test fixtures and
these notes; they are replaced with fictional ones (a Pacific point, an Evergreen Terrace
address) that exercise the same code. They remain in git history — in `cafes.json` backups up
to 28 Aug and in the fixtures until v61. Removing them from history means rewriting and
force-pushing `main`; that is the owner's call — **and on 29 Sep the owner chose to leave the
history as it is.** Do not rewrite it or raise it again unless they ask.

**v61 blanked the map for the owner — fixed in v62, same day.** Publishing the private rule
made the owner's private read succeed for the first time, which reached code no test had run
with Firebase connected. A private spot with no pin arrives from Firebase with *no* lat/lng
keys (it stores no nulls); `adoptCafes()` compared `undefined !== null`, flagged it as an exact
record, and the heal passed `lat: undefined` to `set()` — which Firebase **throws on
synchronously**. The throw escaped `load()`, and boot had no `.catch`, so everything after it
(the map, the live sync, editing mode) was skipped on every device. Three layers now: missing
reads as null in the heal check; private values are stripped of `undefined` and each private
write is guarded; and `load().catch(...).then(...)` so no failure in loading can cost the map.
`tests/boot-firebase.js` boots against a fake that behaves like the real database in exactly
those two ways; eight of its checks failed on v61.

### Want-to-try on the map — 13 Oct 2026 (v63)

"It's hard to see wishlist location." Measured: the pin was a 20px pale-blue ring at a quarter
fill, no white edge, `zIndex` 1, and folded into the orange clusters with everything else. On
Google's ground it stood out 2.0–3.0:1 (the fill 1.2:1), in the same blue as water, transit
and the you-are-here dot; De Matcha, 130m from 8 Grams Matcha, disappeared into it. The Want
tab's map button zoomed to the wishlist but left all 107 visited pins around it.

- **The pin** (`WISH_HEX` #6B3FBF, `wishPinIcon()`): a visited pin's size, white edge, white
  bookmark — 4.6–6.8:1 on streets, roads, parks and water, a hue nothing else on the map uses,
  and readable without colour. An SVG data-URL icon because a `SymbolPath` cannot carry a
  second colour for the mark.
- **The layer:** `MAX_ZINDEX+500` — above cluster bubbles (`MAX+n`), below the you-are-here
  dot (`MAX+1000`) — and never clustered; only visited pins go to the clusterer.
- **The switch** (`#btn-want`, `toggleWantOnly()`): hides visited pins and shows a bar, "Only
  want to try · 3 here, 7 in all" with Show all. It **shows and hides the existing markers**
  instead of calling `renderMarkers()`, which refits to every pin it draws — on a wishlist
  spanning the Bay Area and Vancouver that would throw you out to half a continent per tap.
  It moves the map only when none are in view. The Want tab's map button turns it on; Been's
  turns it off. Hidden when nothing is on the wishlist. On a phone the search row now spans
  the width so the place picker gives way to it.
- **Trap found on the way:** the pressed switch first used a translucent violet in dark mode.
  The chip floats over Google's map, which stays light in dark mode, so it read 1.3:1 while a
  test judging it against the dark page passed. Fills over the map are solid; the test now
  requires that.

The mock's enlarged "tapped" pin was left out: no pin grows on tap today, visited ones
included, and the card already says which cafe it is. `tests/want-pins.js`; on v62 its pin
and layer checks fail and the switch does not exist.

### The 14 Oct audit, built — Stage 2 (v64)

An overnight read-only audit (`overnight-cafe-audit.html`, kept out of git) produced ten items; the
owner picked all of them. This is the head, accessibility and security half.

- **Head.** A description and Open Graph/Twitter tags (the app has a Share button and links used to
  preview blank; `og:image` is the 512px icon at its absolute Pages URL), `mobile-web-app-capable`
  beside the deprecated apple tag, and the `Cache-Control/Pragma/Expires` metas removed (browsers
  ignore them; the service worker and `?v=` are the real strategy).
- **One heading.** Phones hide *both* visible titles (the map screen has no top bar), so a
  screen-reader user had no `<h1>` at all. One `sr-only` `<h1>` in `<main>`; the two visible titles
  are `.apptitle` paragraphs; the form title is an `<h2>`. Emoji on tab and nav buttons are
  `aria-hidden`, so a button's name is "List", not "☰ List".
- **No shared passphrase.** `ADMIN_PASS` sat in `js/config.js`, served to every visitor, and was used
  only when Firebase auth was unavailable; the rules never honoured it. Removed; without Google
  sign-in `toggleAdmin()` now says so and changes nothing.
- **The clusterer is vendored** (`vendor/markerclusterer-2.5.3.min.js` + its Apache-2.0 licence): the
  same file unpkg served, taken from the npm registry. One fewer third-party host, and the offline
  shell caches it. **Not done: SRI on the three Firebase scripts.** The audit environment could not
  reach gstatic to hash them, and a wrong integrity value would stop the app loading, so none was
  guessed. Do it from a machine that can `curl` the files.
- **XSS pass.** Every value spliced into an HTML string was traced (a script listed all
  `'+expr+'` operands outside `esc()`). All free text — names, areas, drinks, notes, sync dialogs —
  is escaped. Findings: cafe ids go into inline `onclick="openDetail('<id>')"`, where HTML-escaping
  does *not* help (entities decode before the JS runs), so `adoptCafes()` now refuses any id that is
  not `[A-Za-z0-9_-]{1,64}`; `initials()` was inserted raw (two characters, so not exploitable,
  now escaped); and `applyCardPhoto()` built a selector from an id (now `CSS.escape`d). Only the
  owner can write cafes, so none of these was a live hole. **The 100+ inline handlers remain**, so a
  strict CSP is still not possible without `unsafe-inline`.
- Pinned by `tests/hardening.js`.

### The 14 Oct audit, built — Stage 3: UI (v65)

- **Filters you can combine (U1).** The filter panel gained **Verdict** (Loved it / It was fine / Not
  for me, with counts) and **Area** chips beside the single-select Type chips, so "loved, in
  Southside" is two taps. Area groups on the part before the first comma ("Downtown, CA" and
  "Downtown" are one place), shows only areas with company (a chip per one-off is the list again),
  and a lit one always stays visible. Verdict is hidden on the Want tab — a place you have not been
  has no verdict. A **result line** ("78 of 110 places · Clear") appears only while something is
  filtered, so the default chrome is unchanged (the `list-clean` budget still holds), and Clear
  resets the search box too. `filteredCafes()` is now the one place a list is decided: the map
  button used to carry its own copy of the filter, which is how a new filter would have drifted.
  **Why not the mock's three always-visible rows?** They would cost about 190px before the first
  cafe, which is what `list-clean` exists to prevent; the panel keeps that.
- **Cards lead with what to order** — `Order the X` under the where line (not on wishlist places;
  hidden in the compact layout).
- **First paint, empty states, detail (U3).** The list starts as six placeholder cards at the real
  card's dimensions (no layout shift) and `aria-busy`; the shimmer stops under reduced motion. Empty
  states draw with tokens, say why, and offer one action: Save a place / Log your first visit (owner
  only), Clear filters, Show everything. What you typed is echoed back as text, never markup. The cafe
  page gets "Order again: Matcha latte · 11× · last Sep 27" under the name.
- **Drawn tab bar and a 12px floor (U2).** Emoji tab icons became inline SVG in the tab's own colour.
  `--fs-1` rose from 11px to 12px and the three literal 11px sizes now use the token. The sidebar nav
  on laptops keeps its (now `aria-hidden`) emoji. `tests/overflow-375.js` walks every screen at 375px,
  against the real cafes, for sideways scroll, elements past the edge, and text under 12px; it fails
  when the floor is lowered.
- Pinned by `tests/discovery.js` and `tests/overflow-375.js`.

### The 14 Oct audit, built — Stage 4: performance and types (v66)

- **The sign-in library loads on demand.** `firebase-auth-compat` was downloaded by every visitor, who
  never sign in. `ensureAuth()` (storage.js) fetches it for a device that remembers the owner at boot,
  when Settings opens, or when someone taps Sign in; `FIREBASE_AUTH_SRC` in config.js must stay the same
  version as the two scripts left in `index.html`. Safe because auth arriving after the data was already
  a supported path (the "late sign-in" case in `tests/boot-firebase.js`, which now also covers: a
  visitor never requests it; the owner requests it once; a tap requests it and opens the popup). The
  popup could be blocked if the script loads *after* the tap, which is why Settings preloads it and
  `adminSignIn()` already falls back to a redirect.
- **Photos load near the screen.** Cards put the URL in `data-bg` and an `IntersectionObserver`
  (300px margin) sets it; each card also probed its URL with `new Image()` as it rendered, which
  requested all 100+ photos up front, so verification moves into the same step. No observer: everything
  loads at once, as before. `content-visibility:auto` was **not** added: at ~110 cards it buys little and
  changes layout measurements. `tests/lazy-photos.js`.
- **Types, as a ratchet.** `types/cafe.d.ts` describes `Cafe`, `Drink`, `Order` and `PrivateDetail`
  (including the legacy `dates`/`count` drink shape the code still reads, and the note that Firebase
  returns *missing* fields, not nulls). The core helpers carry JSDoc against them. TypeScript runs over
  the plain JS (`tsconfig.json`, `checkJs`). It started at 93 errors, nearly all `querySelector()`
  returning `Element`; the `$()` helper is `any` on purpose, and 32 remain, pinned in
  `types/baseline.json`. `scripts/typecheck.js` fails if the count rises, so no new error can arrive.
- **ESLint** found 9 things in the whole codebase (dead locals, a useless assignment) — all fixed. Its
  config derives the app's cross-file globals from the files themselves.
- **Prettier** reflowed `js/*.js`: lines over 400 characters went from 39 to 0 (files 3.5k -> 8k lines).
  Layout only; the whole suite, including the regression tests that pin real-data output, is unchanged.
  Expect `git blame` on those files to point at this commit; use `git blame -w` or `--ignore-rev`.
  CSS, HTML and tests were left alone.
- CI now runs lint and typecheck before the tests.

### The map's opening view — 14 Oct 2026 (v67)

"I don't like the zoom out map and around it is gray." Measured: the pins run from Sydney to
Vancouver (309° of longitude), and "All locations" fitted every one of them — the whole globe, 113
dots over open water, and on a phone a map smaller than the screen with grey around it. 72 of 113 pins
are in California; one pin in Sydney set the zoom for the other 112. Of the three mocked options
(`Map Opening View` canvas), the owner chose **C: a World view that earns it**.

- **`worldRegions()`** groups the pins the way the dropdown already does (`cafeCountryName` /
  `cafeStateName`): US states by name, other places by country. `_worldOn()` turns the view on by
  itself when the pins span more than 60° of longitude or 25° of latitude and fall in two or more
  regions, and leaves it off for someone whose cafes are all in one region. The person's choice
  (`mapWorld` true/false) overrides it; the dropdown's first entry is now **World**.
- **What it draws:** one numbered bubble per region (an SVG data-URL icon sized by count, so it
  needs no extra Maps layer), the 113 individual pins hidden, and a sheet under it (`#worldsheet`):
  region, "N been · M to try", a loved/fine/not-for-me bar, the count. Tapping a row or a bubble
  goes to the region, brings the pins back, and **stays there**: `_focusVal` makes the redraw after a
  cloud update refit to that region instead of zooming back out to the world. Want to try recounts
  the bubbles and rows to wishlist places only.
- **The grey, fixed at the source** (in `initMap`): `minZoom` is the zoom at which the world is as
  tall as the map (`_minZoom()`, refreshed on resize), `backgroundColor` is the ocean (`#aad3df`) so a
  tile that has not loaded is blue, and `restriction` limits latitude to ±85°. **These three could
  only be tested against a stand-in Google Maps here**, not the real one.
- **Data fixes found on the way.** Vancouver (49.26°N) was inside the app's US bounding box, which runs
  to 49.5°N, so it counted as the United States, and Canada was not a country at all; it is now
  (checked before the US box). That also changes the country count on Stats and Go, correctly. The state
  detection only knew CA/HI/NV when the area text had no ", XX", so four Seattle-area cafes sat under
  "United States"; it now also reads Washington, New York, Texas and Utah from position.
  **Left alone:** seven cafes in the Philippines, Vietnam, Indonesia and China show as "Other places".
  The country table is crude boxes and guessing more of them would mislabel places.
- **Not built:** options A (open on the home region) and B (region chips instead of the dropdown).
  The World view is now the opening view for spread-out data; A and B would change what it opens on.
- Pinned by `tests/world.js`; fails on the previous map code.

---

## Rejected, and why

Recorded so they are not re-proposed. Each was considered and turned down on evidence.
- **Multi-user ("friends") conversion.** Scoped in full on 27 Sep 2026 — four phases: split
  place facts from the personal record, invite-only membership, the client reads the join,
  social overlays last. The owner then decided against it: **the app stays personal — one
  author, public readers** — which is exactly its current shape, so nothing changed. The full
  plan survives in git history (commit 6f8f2f9) should that ever reverse. One consequence of
  staying single-owner: `ADMIN_PASS` remains, but it only unhides editing UI on a device —
  the database rules and the owner's Google account are the real gate, so a reader of the
  source gains nothing that writes.

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

- Stats now offers an explicit area picker and a user-triggered location action; San Francisco remains the labeled fallback.
- **Drink Elo erased before 16 Aug 2026 is unrecoverable.** The leak is fixed, but every
  `cafes.json` snapshot postdates the loss. 22 cafes kept their scores, and the detail page
  still shows them; nothing writes new ones.
- **`#map-sub`** ("N cafes · tap a pin") no longer renders anywhere, since both title bars are
  hidden on mobile. Map errors still surface through the full-pane `#map-msg`. `.mobile-topbar`
  is dead chrome for the same reason — its `⚙︎` was swapped in with the others so it cannot
  drift, but nothing renders it.
- **Scale drift is now held by a test.** `tests/scale.js` fails on any literal corner radius
  or gap outside the scale, and on any font size outside it except on glyph selectors (emoji
  and icons are artwork being sized, not type being set). New CSS has to stay on the scale.

## The map opens on home, not the world — 14 Oct 2026 (v68)

v67 opened on the World view automatically when pins spread across continents. The owner preferred
option A: the map opens on **home**, and the world is something you ask for.

- Home is the region of the cafe nearest you (within 150 km), else the region with the most pins.
  It is a fit, not a filter: every pin is still on the map.
- The World view (bubbles per region plus the list sheet) now opens only from the dropdown's
  "🌐 World". `_worldOn()` is just `mapWorld === true`.
- The zoom floor, ocean background and pole limits from v67 stay.

## Brand / chain detection — 14 Oct 2026 (v69)

`brand` already existed and already grouped a cafe's other locations on the detail page, but only
10 of 121 cafes had one because it was typed by hand. No new field: the detector fills that one.

- `brandBaseName` strips a trailing "(…)", " - …", "@ …" or "#12"; `brandKey` folds case and
  punctuation. `inferBrand` tries, in order: the spelling another cafe already uses, `KNOWN_BRANDS`
  (config.js — extend it), then a base name two cafes share. A one-off gets nothing.
- Not handled on purpose: a suffix glued to the name with no spaces ("Lin-Cupertino上宇林"), since a
  bare hyphen is also part of real names.
- The form fills `#f-brand` only while the person has not decided it (`brandTouched`); a stored
  brand, typing in the box, or clearing it all count as deciding.
- `backfillBrands(dry)` fills only empty brands; Settings shows "Fill in N brands" with a confirm.
  `cafes.json` itself is not rewritten — the owner's data syncs through Firebase.

v70: "ODD ONE OUT Dunnan Shop" and "Odd One Out Tea San Mateo" were not grouped. The place follows the
name with no separator, so their base names differ, and a bare shared first word is too weak to group
on ("Moon & Back" is not "Moon Tea"). Chains like this go on `KNOWN_BRANDS`: added Odd One Out, Milksha.

## Branches of a brand — 14 Oct 2026 (v71, reworked v72)

Chosen from three mockups: B on the cafe page, A's chip in the form, C's question only for a real
duplicate.

- `getBrandSiblings(c, list, maxLen)` (core.js) groups by `brandKey(brand)`, else `brandKey(name)`, so
  twins with no brand still link. Label: the name's own place suffix, else a unique area, else the
  name; clashes get a number. Visited first, wishlist last. The default cuts labels at 16 characters;
  the detail list asks for whole ones.
- **Cafe page:** no extra row. The area under the title becomes a chip (`📍 San Mateo · 3 branches ▾`,
  or `· ＋ Branch` for the owner on a lone branded cafe) that opens an inline list: 48px rows, whole
  labels, scrolls inside `max-height:min(46vh,288px)`, `＋ Add branch` last (`admin-only`). All drawn
  inside `openDetail`, so the cloud repaint redraws it; the list stays open across a repaint of the
  same cafe and shuts on another. Buttons carry ids only. Viewers can switch, never add.
- Switching does not touch history: `openDetail` never pushed any, so there is no entry to replace and
  Back still leaves the pages.
- **Form:** the brand box is hidden while there is a brand. A chip under the name says
  `🔗 Linked to X (N spots)` with Edit and Unlink; from `＋ Add branch` it is a locked `New branch of X`
  badge. Edit opens More on the box; Unlink clears it and offers `Link to X`. A cafe with no brand
  shows no chip and the box sits under More as before, so the one-screen form is unchanged.
  `openForm({branchOf:id})` carries brand, base name and country; never area, pin, place id, photo,
  rating, review, tags or flags.
- `checkExisting()` (the real-duplicate check, `findSameCafe`) does nothing for a new branch until it
  has a pin, so the sibling it was copied from is not opened in its place. A pin on top of the
  sibling is still the same place.
- "Log again" puts the brand's drinks first, counting a drink ordered once (a menu is small), then
  fills from everywhere. Price stays blank.

## Sync and private-spot hardening — 14 Oct 2026 (v73)

From the sync audit. Each has a test that fails on the v72 code.

- **Private mirror and queue are loaded into memory whoever is looking.** `loadPrivateDetail` used to
  empty `privDetail`/`privPending` for a not-yet-signed-in owner (offline, or auth script still
  loading), so the first private save wrote a near-empty mirror and queue over the saved ones.
  `privFor()` already hides them from non-owners.
- **A private save that never touched the location does not save the location.** With the private
  side unloaded the form shows the BLURRED pin and area; `saveForm` used to queue those as "the exact
  address". It now saves only when the private copy is loaded or the person moved the pin, and
  `savePrivateDetail` refuses to replace a saved address with its own blurred copy. `wasCustom` is read
  before `Object.assign` overwrites the cafe, which also fixes un-privating (the force flag read the NEW
  value).
- **Private queue entries are `{base, value}`.** `flushPrivate` writes in a transaction and only if
  the cloud still holds the base (or the value); a newer address from another device is kept and
  toasted. Bare values (and null for a removal) from earlier versions still work and write
  unconditionally. Removals stay unconditional on purpose: an orphan is worse than a lost race.
- **After a merged flush, the screen takes what landed** (`syncAdoptWritten`). The merge can fold in
  another device's change while the in-memory cafe still holds what this device queued, and a later
  save built from it wrote that older value back over the other device's edit, with no conflict.
- **Before the cloud has answered, `save()` waits** (`syncNeedsFullDiff`) instead of queueing every
  cafe against a null base. `syncBootBase` is the cafes as this device started; the first snapshot
  queues only what really differs from it, using it as the 3-way base. An ordinary edit made while
  offline-at-boot uses the same base. Limit: a bulk tool run offline and closed before the first
  snapshot is not queued (the tools are idempotent — run them again).
- **`syncCanonical` reads null, undefined, `[]` and `{}` as absent**, as Firebase stores them. An empty
  string, `false` and `0` are values. Both devices clearing a photo or tags is agreement; `saveForm`'s
  `photo:null` no longer clashes with a photo added elsewhere.
- **The pre-read in `flushSync` times out** (`SYNC_ONCE_MS`, 15 s) so a connection that looks up but is
  not cannot hold `syncBusy` for ever.
- **Legacy orders get deterministic ids** (`ensureOrderIds`: cafe, drink, date, nth of that day) in
  `adoptCafes` and inside `syncMerge`, so they merge by id instead of all-or-nothing. Existing ids are
  never changed; the oldest drink shape (dates and a count, no orders) is left alone.
- **`fetchAllPhotos` resolves the cafe by id when each photo arrives**; a snapshot replaces every cafe
  object during the minutes it runs.
- Still open, from the audit's minor list: the boot re-seed of an empty cloud from the local cache,
  the legacy dirty-flag path, duplicate-named drinks collapsing in a merge, whole-order conflicts when two
  devices edit different fields of one order.

## The branch header, quieter — 15 Oct 2026 (v74)

v72's chip repeated the place (`HEYTEA (Cupertino)` over `📍 Cupertino · 3 branches ▾`), looked like a
second rating pill beside `● Loved it`, and pushed the page down when opened.

- When a cafe is a brand's branch and its name ends in a real place suffix, the **title is the brand**
  (`HEYTEA`) and the place is the plain line under it; the full name is on hover. Names with no
  separator ("Odd One Out Tea San Mateo") keep their full title.
- The place is plain muted text with a monochrome pin (a CSS mask, so it follows both themes — the
  pink emoji is gone). The control after it is **text, not a pill**: `4 branches ⌄` in the accent
  colour, 44px tall, so the filled rating badge and the thing you tap no longer look alike. The row
  does not wrap: a long place (`South San Francisco`) ellipsises beside the rating (never under 5em) and
  the control keeps its place.
- The list **floats** over the page (`position:absolute` inside `.dloc`, capped at 380px and
  `min(46vh,288px)`) with a shadow, so opening it moves nothing. Each row: rating dot or 🔖, the
  place, how you rated it, a check on the current branch; `Add a branch` (owner only) last. Tap
  elsewhere or Escape closes it, and Escape returns focus to the control.
- Checked at 360, 375, 390, 430, 744, 768, 1024 and 1440 (`tests/branches.js`): nothing overflows,
  targets are 44px, the list stays on screen.

## The branch bar and sheet — 15 Oct 2026 (v75)

v74 still put the place and the branch control on the rating's row, so a long place (`South San
Francisco`) was cut with an ellipsis and the control stayed small. Chosen from three mock-ups (V3):
the branch gets its own row.

- A **48px bar** under the header (`#d-where`, full card width): pin, the current branch's place
  (whole, ellipsised only past the bar), `N branches`, a chevron. The place leaves the rating row, so
  `#d-meta` is hidden whenever the bar is shown; a cafe with no brand keeps its plain area line.
  The name comes from the same label as the list rows (`getBrandSiblings`), so "Ferry Building" and
  "Hayes Valley" are told apart even when both are in San Francisco.
- The list is a **bottom sheet below 900px** (phones and iPad): fixed to the sidebar's bottom edge, so
  it sits on the tab bar, over a scrim, max 78vh and 560px wide, a sticky header (grab bar, brand,
  "N branches · pick one to switch", Done) and 52px rows. From 900px it stays v74's floating card
  under the bar. Same markup for both; `.brhead`, `.brscrim` and the sheet rules live in one
  `max-width:899px` block.
- Opening moves focus onto the current branch. Tap the scrim, tap elsewhere, Done or Escape closes;
  Escape and Done return focus to the bar. The scrim takes its tap from the document handler, not an
  inline `onclick`, so `tests/keyboard.js` still finds no clickable div without keyboard access.
- A cafe on its own with a brand (owner only) shows the bar with its place and `＋ Branch`.
- `.wn` is already a class (the stats figures), so the bar's parts are `.wname` and `.wcount`.
- Not built: the segmented picker. It truncates names and only suits three or four branches.

## "The private rule is missing" — 15 Oct 2026 (v75)

The banner appeared with correct rules published. `privateWriteFailed()` raised it for ANY failed
private read or write, so a dropped connection, a request made a moment before the sign-in token
reached the database, or a bug all read as a missing rule.

- Only `PERMISSION_DENIED` is a rules finding. Anything else toasts what happened
  ("couldn't reach the cloud (…)") and keeps the address queued. The banner now ends with
  `Firebase said: <code>: <message>`, and the console logs it.
- Requests wait for the signed-in user's token (`_privAuthed`), and a refusal is retried once with a
  freshly fetched token (`_privRetryDenied`) before it counts.
- A private read or write that succeeds withdraws the warning (`_privOk`); it never withdraws one
  about strangers being able to write or read.
- v73's `{base, value}` write used `ref.transaction`. A transaction on a path nothing listens to
  starts from an empty cache, returns "abort" at once when the base is not null, and would have read
  as another device's newer address — dropping the edit. It is now a read, a comparison with the base,
  then a write (one owner, so the gap is not a real race).

### Three charts for the data that was already there — 15 Oct 2026 (v78)

`reorder`, the whole drink-habit set and the dates on every order were stored and never drawn.
Stats now has **Cadence** (a 30-week heatmap, busiest month, longest streak, weekday split),
**Price spread** (histogram with the median, a monthly average once three months have three
priced drinks, US against elsewhere only when each side has three, and — owner only — a running
spend total) and **Taste** (the verdict ring, logged against still-to-try, top tags).

All of it is inline SVG and CSS on the theme tokens; chart text is sized in `styles.css`
(`.sc-svg text`), not in the markup, so the type scale holds. **Nothing here reads an area, a
coordinate or a review**, so a private spot contributes a date and a count and nothing else.
The weekday bars come out nearly flat on this data, which is itself the finding, so the card says
so rather than inventing a pattern. Weekend bars are grey, not violet: violet means want to try.

Not built, on purpose: a wishlist *conversion rate*. It needs the date a place was added to the
wishlist and that is not stored, so Taste shows the split only. `tests/stats-charts.js`.

### Graphite, depth and rank tiers — Phase 1 of the guide tune-up, 15 Oct 2026 (v79)

The warm-grey palette read dull next to the orange, and the showcase mock-ups were reviewed in
four palettes; **Graphite** (cool neutral greys, the orange as the one pop of colour) won, in the
device's own sans, so there is still no font to download. All of it is the three theme blocks plus
a polish block at the end of `styles.css`.

- **Tokens:** `--shadow-sm` (raised) beside `--shadow` (floating), `--gold-a/-b/-ink`,
  `--amber-bg/-ink`, `--wash` — each in all three blocks. Gold carries dark ink so `--acc-strong`
  is still the only accent under white text.
- **Rank tiers:** `rankBadge()` adds `r-gold` (#1 to #3) and `r-amber` (#4 to #10) as a class.
  `phInner()` is still the only writer of a tile. The amber ring is a literal colour on purpose:
  the badge sits on its own dark scrim, so it must read the same in both themes and over any photo.
- **Scrims** are `::before` on `.ph` and `.hero` (`::after` on `.ph` is the loading shimmer),
  with `isolation:isolate` and `z-index:-1` so they sit under the badges without moving them.
- Not done in this phase, on purpose: the detail page's gold rank tile and the order banner
  (markup, Phase 3), and two columns at 375px (the 168px grid minimum is a layout change, Phase 2).

### One-tap ways in — Phase 2 of the guide tune-up, 15 Oct 2026 (v80)

A friend opens the app to answer "where should I go", and the only way in was a search box and a
filter panel. **Four guides** now sit under the tabs for a viewer — Top 10, Best tea, Go-to, Near
me — and the search box says what is behind it ("110 spots in 6 countries"), as its placeholder,
so it costs no height. They are one more filter in `filteredCafes()` (`activeGuide`), so Clear,
the result line, the map button and the Filters badge already agree with them.

- **The owner has no guide row.** Their chrome is already the tightest on the screen, so Recent,
  Unranked and Needs price live inside Filters (the badge counts them, because that is where
  they are), and each card carries a **＋** that opens that cafe's visit with its usual drink
  already added (`logAgainFrom()` → `logUsual()`). It opens the form rather than saving, on
  purpose: price is the one thing it cannot know, and a one-tap write is a one-tap mistake.
- **The viewer's row is the one deliberate addition to chrome.** `tests/list-clean.js` measures it
  separately (≤60px) and holds everything else to the old 145px, rather than raising the budget.
- **Near me never asks for location by itself.** Without a position it filters nothing, and the
  tap calls `locate()`, the only path allowed to raise the prompt.
- **The order line carries the price** (`Hojicha latte $7.25`). The words "Order the" stay in the
  DOM for the tests and assistive tech but are hidden when a price is present, because the price
  is what made the drink name clip. No price means no figure, never `$0.00`.
- **Two columns at 375px.** The grid minimum went 168 → 156px; 343px of width is two cards of
  165px with a gap, and was one 343px card before. `tests/list-guide.js`.

### The cafe page leads with what to order, and a postcard worth sending — Phase 3 (v81)

Nobody opens a cafe's page to read a rating, they open it to learn what to get. **"What to order"**
is now the first thing under the name: a glyph for the kind of drink, the drink, what it cost, how
often and when last (`#d-orderagain`, with `.oa-name` / `.oa-meta`), and for the owner a **＋ Log
again** that goes through the same `logAgainFrom()` as the list. The top ten get a gold rank tile
(`.dranktile.top`), a drink's size, sweetness, ice and milk read as pills (`modPills()`), and the
note is set as a quotation. `tests/discovery.js` read the old sentence and now reads the parts.

**Share spot** replaces the bare link. `drawPostcard()` paints a 1080×1350 canvas — rank (gold for
the top ten), name, verdict, area, what to get, the owner's line — and `sendPostcard()` sends it as
a file through `navigator.share` where the device can, hands it over as a download where it cannot,
and falls back to the link. Three decisions worth keeping:

- **It is not the Google photo.** A cross-origin photo taints the canvas, so it could never be
  exported, and it is not ours to redistribute. The picture is the tile: the rating colour and the
  cafe's own emoji.
- **It is built from `c.area`, never `areaOf(c)`** — the same rule as `shareCafe()`, which the
  postcard shares a code path of intent with. It goes to someone else, so a private spot's exact
  place must not travel with it. `tests/share-card.js` seeds a precise copy and checks the text.
- **It is a real dialog**: `aria-modal`, focus moves in, Tab is trapped, Escape closes and returns
  focus to the button that opened it. Opening it never writes anything.

`.oa-gl` joined the glyph allowlist in `tests/scale.js`: it is a 26px emoji tile, artwork rather
than type, like `.drinkicon`.

### The type ratchet could not fail on Windows — 15 Oct 2026

`scripts/typecheck.js` spawned `tsc.cmd` without a shell, which Node refuses on Windows (EINVAL).
It then saw no output and printed `type errors: 0`, so on a Windows machine it passed whatever the
code held — it reported "0" for weeks while the real count was 33 (baseline 32; one had crept in).
It now runs through a shell there and exits non-zero if `tsc` cannot be started at all. The count
is genuinely **0** and `types/baseline.json` says so; the fixes are JSDoc annotations and casts
only, plus one `const _t` that holds `e.target` once so the cast is written once.

### Coffee and Tea Wrapped — Direction A of the stats review (v82)

Three cards from data that was already stored and never drawn, replacing "Your usual":

- **Drink DNA.** "Your usual" printed the single most common value of each option as a chip, which
  hid the shape (82% no sugar and 97% oat is a different story from 52% and 52%). The signature
  sentence stays, now under it: the most loyal order, the biggest gamble (the priciest drink ever
  ordered exactly once) and a bar for the whole spread of sweetness, ice, milk and size.
- **Worth it.** The reorder verdict, stored on most orders and read by nothing on Stats. Share you
  would order again, average price of the ones you would against the ones you would not, the
  order-again rate by price band, and the loved cafes with the cheapest average drink. With only
  three regrets in 96 verdicts the card says the bands are a pattern to watch, not a rule.
- **Chains and independents.** A chain is a brand group of two or more cafes with one you have been
  to, the same grouping the cafe page uses for its branches (`brandGroupKey`), so the two cannot
  disagree. A want-list branch shows as a ring and is not counted as visited.

Nothing here reads an area, a coordinate or a review. `tests/stats-wrapped.js`.

Two test fixes ride along: `stats-charts.js` counted exactly three `.sc-wide` cards and now asks for
at least three, and `currency-units.js` read `core.js` by `\n` and broke when a Windows checkout
handed it CRLF.

### Stats, pruned — and Map direction A (v83)

**Stats lost five things**, on the rule that a card stays only if it tells you something you could not
see already:

- *Top spending* repeated what Spent and Monthly activity say, and *Hojicha priced around town* was
  hard-wired to one drink's name. The price histogram and Worth it's cheapest-loved list cover the
  same ground for every drink.
- In *Price spread*, the monthly average moved by under a dollar, the US-against-elsewhere split stood
  on 18 priced drinks, and the running spend total repeated Monthly activity. The median and the
  histogram stay.
- In *Cadence*, the weekday bars came out nearly flat on the real data, and the "Weekday regular" label
  built from them rested on that. The heatmap, the busiest month and the longest streak stay.

What remains reads, top to bottom: the collection, went back / spent, monthly activity, cadence,
price spread, Drink DNA, Worth it, Taste, regulars, where you go, chains and independents.

**Map direction A.** A visited pin used to be one 24px disc at every zoom. It is now a small dot zoomed
out, a larger one in between, and a pill with the cafe's emoji and name from zoom 15.4, on hover, or when
it is the picked cafe. Pills that would cover each other give way to the better-ranked cafe's
(`refreshPinIcons()`, greedy in screen pixels; it runs on `idle` and on selection, and needs a map that
reports a projection, so the stub maps in older tests keep their plain discs). Colours stay literal hex.
The ring clusters, the single phone pill and the want-to-try pins are unchanged. On a laptop the legend
is a 44px **?** above the locate button, the same fold the phone already had inside the pill's panel.
`tests/map-pins.js`.

**Want-to-try pins joined the same system (v84).** They were the one stand-alone icon: a fixed 30px
violet disc at every zoom. They are now the same small dot, larger dot and pill as every other pin, in
the one violet nothing else on the map uses, each still carrying its white bookmark so it reads without
colour. They are still never clustered, still above the cluster bubbles (`wishPinZ()`), and take
priority over visited pins when two pills would overlap, since a want-to-try is the pin you are looking
for. The 30px `wishPinIcon()` remains as the first paint and the fallback on a map that reports no
projection.

### Placing a new cafe, instead of nudging it (v85)

Measured on the real board before touching it: 29 of 110 cafes (26%) had one or two comparisons and
sat in a band at ranks 36–80 with scores of 4.77–5.24, interleaved with cafes that had ten times the
evidence; and 18% of tier-ordered pairs were inverted (a Fine cafe above a Loved one). Three causes,
all in `rank.js`:

1. **Pairing.** `chaserArm` priced an opponent at `0.35 × its comparisons`, so a new cafe met whichever
   cafe had the fewest — two near-blank cafes, and neither learned anything. It also ignored the verdict.
2. **Elo.** `K = max(16, 32 − winner's comparisons)` read the winner alone: a veteran beating a newcomer
   cost the newcomer about 5 points, a newcomer beating a veteran moved both by about 22. The verdict was
   not used at all.
3. **The score.** `5 + Δ/45 × m/(m+4)` kept 20% of the Elo gap at one comparison, so what a cafe had
   beaten barely showed.

What replaced them, with no new stored field (the sync-merge and `saveForm` traps above stay shut):

- A cafe is **provisional** below five comparisons (`PLACING`). It is placed by a search among the
  *established cafes of its own verdict*: the tier's median first, then a step that shrinks
  (`placementStep`: a quarter of the list, a sixth, an eighth…). Its **Elo is its position in the
  search**, read back by rank among the references, and its comparison count says how far along it is.
  The search is anchored on the cafe it actually met, so it is right however the pair was found. A
  verdict with fewer than six established cafes borrows the whole board.
- **Per-cafe K** (`kFor`: 40 falling to 16). A newcomer moves a lot and a veteran barely moves, whoever won.
- **The verdict is a prior, not a wall.** Below eight comparisons the score is shrunk towards the *tier's*
  average instead of 5.0 (`tierPrior`), and an answer counts for more (m/(m+2)); from eight comparisons on
  it is exactly the old formula, so `tests/beli.js` and every established position are untouched. A Fine
  cafe that keeps winning can still climb past a Loved one.
- Established cafes still pair on drink and area, now with a penalty for crossing a verdict (a comparison
  with an obvious answer).
- The Board lists **Still placing** (owner only), fewest comparisons first, beside "Never compared".

On the real data the score change alone cut tier inversions from 17.9% to 9.6% and moved six cafes by ten
places or more; it does not by itself lift the 18 thin Loved cafes — *new answers do that*, which is the
point of the placement search. In the code, five consistent answers put a new Loved cafe within 1.7
places (worst 3) of where it belongs among 36. `tests/rank-placement.js`.

### Calmer screens — quiet tiles, one accent, rows with landmarks (v86–v87)

The brief: "everything outside the map is crowded and messy". Measured on the running app before changing
anything: the List was **12,032px** of scroll at 390px; 111 of 111 tiles were a saturated placeholder block
carrying nothing the name did not; an admin card held eight things; orange was the order line, the links, the
counts, the active tab, the primary button and the badges at once.

- **Quiet tiles.** A placeholder is a 22% wash of the verdict colour over the surface with the cafe's emoji
  (`nophotoBg`, a `color-mix`), in the theme's own ink. No initials: they were a second mark for the same cafe and
  broke on "HEYTEA (Cupertino)" ("H("). A photo, when there is one, is the only loud thing. `inkOn()` stays: it is
  still the proof the old tints cleared 3:1, and the chaser thumbnails still draw initials.
- **One accent, one meaning.** Orange is the primary action and the current state. Order lines, counts, link
  text and chart-heading figures go to the text colours; a link is underlined. Chart marks are data and keep it.
- **Rows are the default List**, photo cards a layout choice in Settings ("Photo cards" / "Rows"). A row is name,
  what to order and its price, then place and time, with the rank at the right (gold for the top ten). It is
  8,391px against 12,032 (-30%). Sticky bands follow the sort (`bandFor`): Top 10 / 11 to 30 / 31 to 60 / the rest
  by rank, This week / This month by recency, a verdict by rating, distance by near. None while searching, in a
  guide, or in the photo layout. The grid's `.again` plus and `logAgainFrom()` are gone: logging again is the bar
  at the bottom of the cafe page, and a second way to do it was clutter.
- "No pending edits" is no longer printed when there is nothing pending.


**The cafe page, one block and one action (v88).** The rank is a medal on the hero (gold for the top
ten), not a tile beside the name; the order block (glyph, drink, price, how often, last) is the single accented
block and no longer carries a Log again button — the bar at the bottom of the page is the way to log, and two were
clutter. The first three drinks show, the rest are behind "Show N more" (nothing dropped); Edit and Delete live in a
⋯ menu for the owner; the comparisons and edit time ("6.8 from 22 comparisons · edited Oct 14, 5:53 PM") fold under
Details, owner only. The "Liked 23 of 23" bar is gone with `renderReorderRollup()`: the order block already says it.

**Stats in three tabs (v89).** One scroll of fourteen cards (4,838px at 390px) is three tabs now. **You**: the
collection, went back and favourites, Drink DNA, Taste. **Habits**:
monthly activity, cadence, regulars, where you go, chains and independents. **Money**: what was spent (owner only, so a viewer's Money opens on price
spread), price spread, Worth it. Every card is still rendered and the other two tabs are only `hidden`, so
anything that reads the page (and `tests/stats-charts.js`, `stats-wrapped.js`) loses nothing; it is a view, not a
data change. Headings are plain words (no emoji), and the long chart note under Monthly activity is a caption:
"Bar: spend. Green line: share of drinks with a price."


**Logging gets the whole screen (v90).** The form stacked three layers at the bottom: its own Save bar, the tab
bar, and the raised Log, which was the tab you were already on. While you log (phone and iPad widths) the tab bar
steps aside — Back is at the top, Save at the bottom — and `tests/one-screen.js` now measures against the screen's
own bottom instead of the tab bar's top. The currency and the price are one joined field (the select's right border
meets the price input) instead of two controls side by side; nothing about their markup, `syncCcy` or the frozen
rate changed. Not done, on purpose: "Add pin", "Add another drink" and the Log again chips stay accent-coloured —
they are the form's own actions, and `tests/keyboard.js` pins `.hintbtn` to `--acc-strong`.

### The calmer screens at wider widths (v91)

Overnight check at iPad Mini (744) and laptop (1280, 1600) of everything changed in v86–v90. Found and fixed:
the List rows were one 700px strip with the price a long way from the name (two columns from 700 to 899px now,
bands spanning both); a chart's text scaled to 2.3 times its size on a tablet because an SVG fills its card
(`.sc-svg` stops at 520px); a lone card in a two-column grid (the owner's Spent) left half the row empty; and the
sticky band was a darker bar than the panel behind it (it takes `--glass`). The laptop panel (422px) needed
nothing. `tests/wide-screens.js`.

### Contrast and focus, measured (v92)

`tests/a11y.js` resolves every text colour against the layers behind it in both themes. What it found: the count
on a List tab was dimmed with `opacity:.6` (2.5:1 light, 3.6:1 dark), so it is full strength now; the round
buttons over a photo were 2.4:1 against a white photo and the amber rank badge 3.8:1, so their scrims are deeper
(.34 to .5, .62 to .76); `--acc-strong` is `#a5521a` (was `#a8551a`) so accent text also clears 4.5:1 on the grey
`--surface2` tile (4.66); and the row-summary focus ring was the accent at 35% and is the full accent. The gold
medal, the soft tile wash and `--soft`/`--faint` on every surface already passed. Text over a photo or gradient is
judged by its scrim, not by the pixels, since the photo is the user's.


### Go board rows (v93)

A Go row is rank, name, place and the drink there, on two lines (`Kailua · Hojicha latte`; the place is capped at
58% so the drink never vanishes, and the drink is what gives way). The owner's sentence, and for the owner the
bookkeeping (comparisons, score, how often it was ordered), sit behind a 44px chevron `.lbmore` with
`aria-expanded`; a visitor's row with no note has no chevron. The row's own tap area (`.lbhit`) is its sibling, not
its parent, so no button nests in a button. `tests/board-guide.js`.

### Dead-code sweep (v94)

After the plus, rollup and banner button went, a scan (every class in `styles.css` and every top-level function
against all of `js/`, `index.html` and `sw.js`) found what nothing referenced. Removed: `setMilk`, `visitCount`,
`mapInfo` and the never-created `gInfo` info window with its two guards; the `.mkbtn`, `.ro-badge`, `.ro-bar`,
`.swval/.icval/.szval`, `.dr-oldertoggle` and `.lbtimes` rules; and `.filterrow`, `.listhead`, `.fbody`,
`.tagrow-chip`, `.scorebadge` from shared selector lists. Left on purpose: Google's `gm-*` classes and
`gm_authFailure` (Google calls it), the `v-yes/no/neutral` classes (built as `"v-" + verdict`), `inkOn` (a test
uses it), and `importPublished`, `exportJSON`, `revertPublished` in `storage.js`: nothing calls them any more, but they
are the owner's data backup and restore, so removing them is a decision for a person, not a sweep.

### Performance check (v95)

111 rows: the List renders in about 3ms (14ms with the CPU throttled to a quarter), Stats 5ms, a rank map under 1ms. The
one slow screen was Go at 49ms (215ms throttled): it ranked every row by walking the whole board, 111 x 111 score
calls. It reads the one-pass `rankMap()` now (4ms, 25ms throttled), and `chaserBoard()` and the List sort score each cafe once
before sorting instead of twice per comparison (board 5,300 score calls to under 1,300, List 5,000 to under 400).
Search is 8ms a keystroke, so it stays undebounced. `tests/perf-budget.js` counts calls, since milliseconds flake.


### Test hardening (checked, nothing to fix)

The whole suite (53 files) ran green four times in a row on this machine, and once more on a copy of the repo with every
source file converted to CRLF, which is what a Windows checkout can hand back. The tests that read source files
(`currency-units`, `beli`, `list-clean`, `settings`, `scale` and others) already cope. If a future test greps a source
file for a multi-line string, normalise `\r\n` first, as `currency-units.js` does.

### The Wrapped strip (v96)

Direction A from the Wrapped mockup: a row of small swipeable cards at the very top of Stats > You. It reads
this calendar year (`new Date().getFullYear()`, so it starts over every January): visits and cafés (and how many
were new), your drink, where you went back, the busiest month with a twelve-bar chart, how you take it (no sugar,
and the milk if one dominates), and a gold Share card. `wrappedYear(list, year)` is the one pure function behind
it, so a test can feed it anything. It appears at 20 visits (`WRAP_FLOOR`), goes to viewers (nothing in it is
money or a review), and reads no area, coordinate or review: a private spot is a name, a count and a date.
Share is a sentence through `navigator.share`, or the clipboard when there is no share sheet; unlike the cafe
postcard it is text only, because there is no single cafe to draw. No new stored fields. A card that has nothing
to say (no runner-up, no repeat visit, too few sweetness answers) leaves out its line or itself.
`tests/wrapped-strip.js`.

### The ⋯ menu stays put until it is put away (v97)

Edit and Delete live in a `<details>` (`#d-more`), and a `<details>` stays open until something closes it.
Choosing Edit opened the form and left the menu open, so after saving a visit the cafe page came back with the
menu floating over it, and nothing closed it. `closeMoreMenu()` now runs on Edit, on Delete (before the
confirmation, so declining leaves it shut), on any tap outside `#d-more`, on Escape (focus returns to the ⋯
button) and at the top of `openDetail`, so no cafe page opens with it already out. `tests/more-menu.js`.

### The postcard is a Story, with a drawn cup (v98)

Direction B of the share-card mockup. The picture was typed: whatever emoji was stored, which is the coffee cup
for 101 of 122 records, on a fade that was the verdict green for every cafe. It is drawn now. `cafeKind(c)`
reads what the place serves (a chosen emoji first; then boba, gelato, a pastry name; then **the drink you order
most there**, so Kissaten HiFi is a cup because you go for a flat white; then the name) and picks one of five
vessels in `CARD_VESSELS` (bowl, cup, boba, gelato, pastry), stroked as `Path2D` in cream on a fade in
`CARD_KINDS`' colour for that drink. "Loved it" stays in the pill and the rank medal. Drawn art also looks the
same on every phone, which an emoji does not. `teaKind(text)` is the one judgement call (a tea place that is not
plainly boba: whisked bowl or tapioca cup).

The canvas is 1080 x 1920 for Instagram Stories, which lays its own bars over the top ~14% and bottom ~13%. The
colour runs edge to edge; the rank starts below `SAFE_T`, the footer ends above `SAFE_B`, and the note's line
count is worked out from the room left above the footer rule. The footer says only "JL CAFE PROJECT": there is
no app to open, it is a web page, so the line "OPEN IN THE APP" is gone. The share message still ends with the
cafe's link, and the preview shrinks to keep the Share buttons on a small phone's screen. The default-coffee
guess is for the card only; the emoji on tiles and pins elsewhere is untouched. `tests/postcard-mark.js`.


The hero fades into the paper, as in the mockup the owner picked. A rounded-sheet-on-colour variant was tried and
set aside: it was cleaner at the seam but the owner preferred the fade. What was wrong was the blank white band
under the footer, so the bottom of the card now takes a soft wash of the drink's colour (30% at the very bottom,
starting 240px above `SAFE_B`), which mirrors the top and finishes the card without a hard edge.

**What the mark is guessed from (v99).** In order: a chosen emoji; the name or brand saying it outright (boba, gelato,
a bakery); the drink you order most there; then a vote across its other drinks weighted by orders, plus the cafe's own
`matcha`/`boba` tag; then the name. Each drink is read by `drinkKind`, where matcha words beat boba words (a hojicha
latte with salted cheese foam is a hojicha latte, the foam is a topping), `tea` beats `latte` (a black tea latte is
tea), and "Mattcha" counts. The first version ran the boba keywords over every drink name before looking at what you
order, so one cheese-foam topping turned Komeya No Bento, a matcha shop, into a boba cup. A scan of all 111 cafes
after the fix: 38 bowls, 46 boba cups, 25 cups, 1 gelato, 1 pastry.

On the card the rank and "of 111 on my list" are stacked (rank on top, where it stands directly under it), not split to the
two edges of the card, where they read as two unrelated facts.

## The picks batch (v100)

Seven things picked from the overnight findings, built together.

**A teacup, and the order beats the name.** A sixth drawn vessel, jade, for plain tea (a tea shop selling Ceylon
black tea is not a boba shop); `teaKind` is gone. A gelato or bakery name now only decides when nothing you ordered
says otherwise, so Zen Gelato, where you order the matcha latte, is a bowl. COMEBUY and Teapioca are boba.

**The smart mark everywhere.** `cafeMark(c)` is the one place that decides the emoji a cafe shows: the one you chose,
else the guess the postcard uses (cached per cafe, since a search asks for every cafe on every keystroke). It feeds the
List tile, the cafe page, the map pin, the Go queue and the List's search, which reads the emoji as a type word:
"boba" finds 32 cafes instead of 16 and "matcha" 40 instead of 29. ☕ is the default, so a deliberate coffee cup on a tea
shop cannot be told from "not chosen"; any other emoji you pick always wins.

**Year and Top 5 Stories.** The Wrapped Share opens the year as a 9:16 Story, and the Go tab has "Share my top 5" (the
owner's, three ranked cafes minimum). Both use the cafe postcard's pieces (`_pcRings`, `_pcVessel`, `_pcWash`, `_pcFoot`,
`_pcMedal`) and its dialog, which now shares through `_pcSubject` (title, message, link, file name) instead of assuming
"the current cafe". The top five is numbered 1 to 5 on the card, leaves out private spots (somebody's home) and
wishlist cafes, and a private spot is never named as where you "went back". Share on the strip is the owner's.

**Wrapped falls back to last year.** `wrappedPick` shows this year's strip once it has 20 visits and last year's, marked
"in review", until then, so the year in review is there in January.

**Your data.** Settings has a Your data card (owner only): Download a copy (a dated file of every cafe) and the daily
backup's date, read from the backup file. The old `exportJSON` also cleared the unsynced-edits flag, which a download
must never do, so `downloadCopy` replaces it. Restore was not built: GitHub history is the safety net.

**The same-cafe check.** `findSameCafe` compares names through `sameCafeKey`, so "MoonTea" beside "Moon Tea" and a
" - Burlingame" suffix are one cafe when also within about 150 m (or the same area, with no pins). Branches of a chain are
further apart. A match merges the visit into the existing record with a toast, so how forgiving the key is matters:
that rule is the one marked `TODO(human)` in `form.js`.

**A ready signal for the tests.** `boot.js` sets `data-ready` on `<html>` after the first paint; the harness exports
`ready(page)`; 23 fixed `waitForTimeout(900)` warm-ups in 21 test files now wait for it. `offline.js` and `updates.js` keep
fixed waits: they are about a service worker and a new build, not about boot.

## The risk review fixes

Found by a read-only review of sync, private spots and the ranking, each proven before it was fixed.

**A conflict answer decides only what clashed.** The prompt says "Everything else was merged for you", but the two
buttons kept one whole version: a phone and an iPad that each logged a visit and both changed the rating lost one
of the visits whichever was picked. `syncMerge` takes a `prefer` side, used only for a clash, and
`resolveSyncConflict` writes the merge (against what the cloud holds now) and shows it. `tests/sync-resolve.js`.

**No place id on a private spot.** `redactPrivate` drops `pid`, which opens the exact place on Google Maps, and
`adoptCafes` heals an old record that has one; the backup job drops it too and refuses a file that still carries one.
The owner loses nothing: private spots skip Google photos, and directions use the owner-only address.

**Signing out forgets the exact addresses.** `forgetPrivateHere` empties the browser's copy of the owner-only
addresses when the owner signs out, keeping only a write still waiting for the cloud (dropping it would lose the
address). It was readable in the developer tools of any browser you had ever signed in on.

**Small ones.** The cache behind the verdict averages now changes with a verdict (rating) and the wishlist flag, so
moving a cafe from Loved to Fine moves the averages at once. The Top 5 Story only takes cafes past placement (5+
comparisons). Two devices ranking the same cafe before syncing still keep only one comparison's effect: fixing that
needs a stored log of comparisons, more risk than the drift.

## The redesign: one visual language (v101)

From a read-only audit of every screen. The share cards had found a better language (the cafe drawn in line art,
coloured by what it serves) than the app they came from, which still used a pale verdict-green tile with an emoji,
and a mix of 27 emoji and 5 line icons for its controls.

**The drawn mark everywhere.** `markArt(c)` draws a cafe's vessel (the card's own six) and `markBg(c)` its drink's
colour; `nophotoStyle`/`nophotoHTML` use them, so every tile without a photo, the cafe page hero (with the card's
rings), the Go queue and the rank sheet show the same mark. The tile used to carry the verdict, and with 79 of 111
cafes Loved, 71% of the List was one green; the verdict is the dot by the name, and `tintFor` still colours the map
pins, where it is the point. A chosen emoji that names a kind draws that kind; any other (🏠) is shown as itself. The
rank sheet's initials are gone, and `initials()` with them.

**One line-icon set.** The symbols live once, in a hidden sprite at the top of `index.html`; `ico(name)` draws one
anywhere. Every control (the sidebar, search, the cafe page's back, favourite, wishlist, Directions, Share and ⋯,
Settings' tools, the map pill, the Go chips, the update bar) uses them. Emoji stay only where they are content: a
cafe's own mark, a drink's glyph, the 👍 😐 👎 answers, the drink-type filters. A `<select>` option cannot hold an
icon, so the map's region list reads "World" in plain words.

**Content first on Go.** Rank a pair, Share top 5 and Near me are one row of chips under the heading (Rank a pair the
filled one, with what is left to place inside it), not three full-width grey bars that read as disabled. The first
cafe moved from 279px to about 150px. On the List, Settings left the inside of the search field and sits beside it.

**Three button styles.** Primary (the accent, filled), secondary (the surface with a hairline: `.btn.ghost`,
Settings' tools, the links between tabs, Show more) and quiet (accent text). Chips and segmented tabs are selection
controls, their own family.

**Smaller fixes.** A drink's glyph follows `drinkKind`, so the cafe page and the card agree on every drink (a Flat
White was a soda cup on one and a coffee cup on the other). Nothing tapped on the Log form is under 44px. Tapping a pin
closes the region menu and the legend before its card opens. `tests/redesign.js`.

## A shared link keeps the map on its cafe (v102)

Opening `?cafe=<id>` opened the cafe's page, but the map behind it (and the one you go back to) framed the whole list,
and a second later framed it again: `renderMarkers()` reframed the map on every call, and it runs on the first draw,
on the cloud's update, and on every favourite, save and sign-in. So a friend tapping a shared link, or anyone who had
panned somewhere, was thrown back to the full map.

Two changes. A shared cafe now asks the map to open on it (`focusCafeOnMap`): centred, zoom 15 (13 for a private
spot, at its blurred pin, so the zoom matches the blur), its pin picked, and the map counts as placed (`mapOwned`). If
Google has not loaded yet, the request waits for the first draw. And drawing the pins only frames a map nobody has
placed: once you or a shared link has positioned it, redraws leave it alone. Finding where you are already respected
`mapOwned`. `tests/shared-link.js`.

## The Top 5 Story loses its frame (v103)

The Top 5 was the last Story still drawn as a rounded cream sheet with a shadow on espresso, which left a dark frame
down both sides and along the bottom, and a hard edge under the title. A first try faded the header into the cream
paper like the postcard, but a list of five on cream read as too white. So it is all espresso now, like a menu board:
the dark runs edge to edge, the list sits straight on it in cream (names), cream at 66% (areas) and caramel (drinks)
at the same 72px margins as the other cards, and the bottom glows in the colour of the #1 cafe's drink. The rings are
drawn on their own layer and faded out with an eased mask, since a straight fade leaves a line where it ends. Two
things change for the dark: the medals for #4 and #5 are cream (`_pcMedal`'s `onDark`), because dark glass vanishes
on espresso, and the discs get a faint cream rim so the coffee ones don't sink in; the footer is cream too
(`_pcFoot`'s `onDark`). `tests/stories.js` checks there is no jump between the card's edge and the space inside it, and
that the list sits on dark.


## A note on one cup (v104)

At Jandii with a bad drink there was nowhere to say so: the closest was the 👍 😐 👎 for "Would order again?", three
taps deep in the visit's Edit form. Now every drink on the cafe page has a ⋯ (owner only) that opens a sheet about its
newest cup: Add a note, Would order again? (saves on the tap), Log another today (a new cup of that drink, dated today,
at the last price and options), and Edit in the visit.

**The note belongs to the cup, not the drink.** A drink can be great on the 5th and bad on the 21st. So `note` and
`tags` live on the order. `drinkOrders()` copies them, but they are not in `DRINK_ORDER_FIELDS`, so
`syncDrinkSummary()` never mirrors them onto the drink's top-level summary. Under the drink, the newest cup with a note
shows its verdict, tags and words, tinted for the verdict, with a line saying which cup it was and, when another cup
went the other way, that one ("Today's cup · Oct 5 was 👍"), so one bad cup does not read as the drink always being bad.
Each cup's row in the history shows its own note. Everyone sees notes, as they see My thoughts.

**Tags.** What was off (too sweet, not sweet enough, too bitter, burnt, watery, too much ice, too milky, overpriced) for
👎, 😐 or no answer; what was good (just right, rich, smooth, great value, pretty) for 👍. A tag you picked stays on show
if you change the answer, so nothing you chose disappears.

**The form carries it.** `saveForm()` rebuilds every order from the form, so a field the form does not hold is dropped
on the next save. Each cup in the Edit form has a "Note on this cup" box, and its tags ride in a hidden field.

**Sync.** Notes merge like any change to an order, by order id. A drink logged before orders had ids gets them the first
time the sheet writes to it, as the form gives them.

**Layout.** The ⋯ takes 40px from the drink row, so a long drink name now wraps to a second line instead of being cut.
`tests/drink-notes.js`.

## The user test batch (v105)

Five made-up cafe-goers used the app on 26 Oct: four visitors on the live site (a friend with a link, a coffee
regular, a matcha hunter, someone visiting for a weekend) and the owner on a local copy. What changed:

**Getting there, first (R1).** Directions, Hours and Share sit under a cafe's name; they were the last thing on the
page. Hours opens the cafe on Google Maps (by place id when there is one), which keeps hours current at no cost. A
private spot gets neither Directions nor Hours. The bottom buttons stay.

**One word for visitors (R2).** "Loved it" covers about four in five rated cafes, and beside it "#86 of 115" read as a
bad grade. A visitor reads a tier from the position (`cafeTier` in rank.js): Must go (top 10), Great (top 40%), Good
(the rest of what was loved), Okay (a fine outside the top 40%), Skip it (any "not for me"). The owner keeps the
verdict and the number. Two cafes on one score read "=N" everywhere a position is printed (`rankText`); the counts
live on `rankMap()` as a non-enumerable `_tied`, so its keys are still only cafe ids.

**Stats in Jorge's name (R3).** `OWNER_NAME` in config.js and `youOr(you, them)` in core.js: each phrase is written
in full both ways ("How you take it" / "How Jorge takes it") rather than swapping a word. The first Stats tab is
"Jorge" to a visitor.

**Go by kind and region (R4).** A region menu (`regionOf()` values: a US state or a country) and a row of kinds (the
kind each cafe's mark is drawn from, `cafeKind`) filter the standing. Positions are counted inside what is shown, so
the best coffee in California is first. The List has Best coffee beside Best tea, by the same kind.

**A first visit (R5).** Once per device, for visitors only and never over a ?cafe= link, a sheet says it is Jorge's
list, how many cafes in how many countries, and offers regions, the top 10, or looking around. The map pill now names
the region the map opened on: `regionOf()` spells values differently from the menu, so the pill used to find no match
and say "World" over a map of California.

**A cup on one sheet (R6).** Log a drink here, and the drink's own ⋯ "Log another today", open the quick cup: this
cafe's drinks most ordered first, Same as last time (size, milk, sweetness and ice of the last cup), the last price,
👍 😐 👎, Save. More options is the full form with the cup in it. Saving takes a wishlist cafe off the list and asks the
ranking question, as the form does.

**No dead ends (R7).** A search with no match offers the best places of the kind it was about (`queryKind`: "pour
over" is coffee), and Clear filters only when a filter is on. Near me with location off offers the regions: a row on
Go, a "Where are you?" sheet on the List, and the guide becomes that region (`pickedRegion`, shared with Go).

**Rank a pair (R8).** Never compared, then still placing (fewest answers first), then two settled cafes on one score
asked against each other, then the fewest compared. A settled cafe's opponent costs more for another kind (+0.6) or
another region (+0.5). The question says what the two share ("Both coffee, both California").

**Links that preview (R9).** Share hands out `/c/<id>`. `scripts/share-pages.js` writes one page per public cafe with
its name, place, verdict and what to order, which forwards to `?cafe=<id>`; the nightly backup runs it and commits
`c/` with cafes.json. `404.html` forwards a link to a cafe newer than the last run. Private spots never get a page,
and the service worker leaves `/c/` to the network.

**Tidy up (R10).** Settings counts visited cafes with no drink, verdict, price or date and walks them one at a time.
Skip asks again next time; I don't remember never asks about that cafe again on that device.

**Region names (R11).** The region menu reads "Cupertino, CA" as Cupertino (`cityOf`), so one town is one entry; the
cafe's own area text is unchanged. The report also said "Capitol Hill under Utah" was wrong. It is right: that cafe
is in Salt Lake City, which has its own Capitol Hill.

**One sheet.** The drink menu's sheet (#dnsheet) is now the app's: `openSheet(html, opener, onClose)` and
`closeSheet()` serve the quick cup, Tidy up, the region picker and the welcome. The test harness marks every page as
already welcomed, so no other test has to dismiss the welcome, and now serves "/" on Windows.

## One get-there row (v106)

v105 added Directions, Hours and Share under the cafe's name and kept the old Directions and Share spot at the bottom
of the page as well. Two of each read as a mistake. The bottom pair is gone; the bottom of the page keeps only the
owner's ⋯ (Edit, Delete), and `#d-share` (where focus returns after the share card) is now the Share in the top row.
`tests/visitor-view.js` checks the page has one of each.

## One set of parts (v107)

A UI audit on 26 Oct found the app had grown one feature at a time, each bringing its own chip, card, icon and
header. What changed:

**One header (U5).** Go, Stats and Settings open with `.pagehead`: the title at `--fs-5`, a quiet line beside it.
Settings and the form have one back button (`.backbtn`, round, the drawn chevron); the grey squares with a typed "<"
are gone. Stats is titled "Your numbers" for the owner and "Jorge's numbers" for a visitor. Go's board lost its extra
16px of inset, so it lines up with every other screen.

**One chip (U1).** List guides, Go's chips and kinds, the Log again chips, a sheet's tags and the filter chips are one
shape: a pill with a hairline on the surface colour, 600 weight at `--fs-2`, a line icon on the left, a quiet count on
the right. Chosen is the ink colour, filled; the accent fill stays only for the primary action (Rank a pair).
Tappable chips keep 44px; a cafe's tags are 28px labels.

**Icons and cards (U2, U6).** A drink is drawn with its kind's vessel on its kind's colour (`drinkMarkSVG`), as cafe
tiles are, in the drink list and What to order; a drink no rule recognises gets a plain cup on grey. The List guides
use line icons. Stats has two kinds of card: feature (tinted: the Wrapped strip, Drink DNA) and surface (white, hairline).

**Calmer drink cards (U3).** A cup's options are one line, "8 oz · oat · no sugar · warm" (`orderOptsText`), in the
drink card and each cup of its history, instead of four coloured pills. The quick cup uses the same phrasing.

**One word for visitors (U4).** A visitor's List row, photo card and map preview show the tier (`tierChip`, Must go to
Skip it), matching the cafe page. Go keeps positions; the owner keeps numbers everywhere.

**A List a visitor can read (U7).** A visitor's List opens by last visit (`defaultSort`), so its bands match the date on
each row; the owner's still opens on edits. A choice in Filters sticks. Rows drop "No visit date", and an area that is
a bare number ("36") falls back to the state or country, as Go already did.

**The map (U8).** A quieter base style: no transit, road icons or place labels, greyer roads, softer parks and water.
Larger dots from zoom 11.5 and name pills from 13 (they waited for 14.4 and 15.4), with the same give-way rule.
Clusters stop at zoom 11. The pill tracks the place it names (`_pillVal`) and says "All places" once most pins in view
are elsewhere (`syncPillToView`, on idle): it said "California" over the whole Pacific after the welcome closed.

**The rest (U9 to U11).** The laptop sidebar is `clamp(420px, 38vw, 660px)`, about 486px at 1280. A visitor's raised
button is Near me (`nearMeTab`): Go, sorted by distance, or the regions when location is off; it was Find, which only
focused the List's search. In the form, Log again is a sentence-case label, the currency menu is quieter, and the
cup's options ("Today · size, sweetness, ice, milk") are a bordered row.

Not done: U12 (moving the 98 literal colours and 18 shadows into tokens) was not picked.
`tests/ui-system.js`.

## The pill, by geography (v108)

v107's pill check counted the pins in view that belong to the place it names. A city in the region menu is the cafes
whose area text says so, so San Francisco's Parkside and Dogpatch cafes counted as "elsewhere" and the pill said
"All places" over a map of San Francisco. It now asks whether the middle of the map is inside the box around the
place's cafes, with a margin of a quarter of its size and at least about 10 km (`syncPillToView`).

## The engineering audit (v109)

Eleven picks from a look at the app as an engineer would; nine are in this release and two wait on a setting.

**No inline code (E4).** 156 controls carried their code inline (`onclick="openDetail('<id>','list')"`), so an id or
a name had to survive being a JavaScript string inside an HTML attribute, and no Content Security Policy could forbid
injected script. A control now names an action: `act("openDetail", [c.id, "list"])` writes `data-on` and JSON
`data-args`, and one listener per kind of event calls it, and only names `act()` wrote or the page's markup names.
Input, change, blur and scroll listen in the capture phase, because an event made by script (`new Event("input")`)
does not bubble unless asked to; click stays in the bubble phase so a child's `stopPropagation()` keeps its meaning.
With the theme snippet moved to `js/theme.js`, the page has no inline script at all, and `index.html` now carries a
policy that allows script only from this site, gstatic, Maps, the database and Google sign-in. It was run against
the real services (`tests/csp-live.js`, at the live address): that is how the database's long-polling fallback was
found to need a frame from `*.firebaseio.com` — reads worked without it, writes from a network that blocks
WebSockets would not have. The exchange-rate service had moved (frankfurter.app answers 301 to frankfurter.dev); it
is asked directly now, so the policy names one host.

**Pinned scripts (E3).** The Firebase scripts from gstatic carry `integrity` hashes, the sign-in one too
(`FIREBASE_AUTH_SRI`), so a changed file is refused rather than run. `node scripts/sri.js` writes new hashes after a
version change; `--check` says whether the pinned ones still match.

**Rules as a file (E2).** `database.rules.json`, deployable with `firebase-tools deploy --only database`, and put to
the emulator on every push: a visitor and a signed-in stranger read the map and nothing else, the owner's address
without a verified email is refused, the owner writes both nodes and nothing outside them. Weakening the rule (no
`email_verified`) fails exactly the one check it should.

**First modules (E5).** The pure helpers (`esc`, `safeUrl`, `editDistance`, `fmtDate`, `orderOptsText`) and the
Elo arithmetic, now including `eloStep` out of `chaserApply`, are ES modules in `js/lib/` with Node unit tests. The
app still has no build step: the modules load first and hand their functions to the classic scripts, which are
now `defer` to keep the order. The first unit test run found `safeUrl` letting `' ( )` through:
`encodeURIComponent` leaves them alone, and rank.js puts the result inside `url('...')`.

**Problems log (E6).** `warn()` keeps the last 20 problems on the device, shown to the owner in Settings with
"Copy for Claude". Building it found a boot that called `firebase.auth()` before the sign-in script was loaded and
caught the throw — harmless in the console, but it would have logged a problem on every visit.

**One rule per selector (E7).** 67 selectors were stated two to four times in the same context. Each was folded
into one rule, in whichever place keeps every declaration's standing; `scripts/css-diff.js` compared the computed
style of every element before and after over 348 states and found none changed. The two it caught on the way were
`.statcard` and `.pfig`, whose last `box-shadow:none` only won because it came after the shared card shadow.
`tests/css-shape.js` keeps one rule per selector. `@layer` was not used: layer order outranks specificity, so it would
re-decide every contest the file settles by specificity today, and the `!important` it could retire are mode
switches that must win anyway.

**Faster tests (E8), one-step bump (E9).** The suite runs four files at a time (5–6 minutes to about one) and a
file that fails is run again alone, named as flaky if it then passes. `npm run bump` moves every `?v=` and the
service worker's versions together.

**Waiting (E1, E10, E11).** The deploy that runs only after the tests pass has been in `deploy.yml` since 13 Oct and
has never run: Pages still publishes the branch directly. It needs two settings (Pages source "GitHub Actions", and
the variable `PAGES_VIA_ACTIONS=true`). Moving the backup bot to its own branch and minifying at deploy both build on
that, so they come after it.

## The site as published (v110)

**The gate is on (E1).** Since 27 Oct Pages publishes what `deploy.yml` builds, only after the tests pass. The first
gated deploy also stopped publishing the repo: `README.md`, `DESIGN_NOTES.md`, `tests/` and `server.js` went from 200
to 404 on the live site. Two manual Run workflow requests were accepted by GitHub and never started a run; a push
started one at once, so a push to main is how to redeploy.

**The nightly backup has its own branch (E10).** `backup.yml` commits `cafes.json` to `data`, a branch with none of
main's history (created by the first run), so main carries only people's commits and a push is never turned away
because the night's backup landed first. The deploy runs when a backup succeeds, takes `cafes.json` from `data`, and
makes the share pages from it at that moment. Main no longer commits `c/`: a copy there would only be as fresh as
the last time someone regenerated it, and a cafe made private since would keep its page. Main keeps a `cafes.json`,
no longer refreshed, as the data for local runs and the tests, which want it to stay put. The deploy checks the
file it publishes for a private spot's precise location once more (`checkData`), naming the spot by its position,
never by anything about it. v110 also set the published `cafes.json`'s file time to the backup commit's, for
Settings' "the last one was", on the belief that Pages serves a file's own time as Last-Modified. It does not: the
live site gave every file, the icon included, the same Last-Modified, the deploy's. v111 below replaces it.

**Minified at deploy (E11).** `scripts/build-site.js` minifies the scripts and the stylesheet with esbuild:
624 KB to 344 KB, 191 KB to 106 KB compressed. The classic scripts are minified with no module format, which is what
keeps esbuild from renaming a top-level name: the page calls functions by name (`data-on`), and the scripts read each
other's variables. Output is held to ES2017, the newest syntax the source uses, so minifying cannot give a phone
syntax it lacks. CSS is not lowered. Each file gets a source map beside it, so a stack from the problems log can be
read back to a line. The proof is three ways: `tests/site-build.js` (every one of 703 top-level names still there,
the copy runs clean), `npm run test:site` (the whole suite against the minified build, which the deploy now runs in
place of the plain suite; App checks still runs it against the source), and `scripts/css-diff.js` against the
minified stylesheet: no computed difference in 348 states, once the dark `--border` was written `.1` rather than
`.10`, the one spelling esbuild changed (a custom property's value is compared as written).

Two tests read what the server handed out where they meant the source or the served copy: `discovery` regex-matched
the served stylesheet for how a rule is written (now read from the repo), and `cache-version` edited the repo's
`config.js` to prove a changed served file arrives (now the served folder's).

## The backup's date, in a file (v111)

Settings' Your data card said "The last one was <date>" from `cafes.json`'s Last-Modified. On Pages that is the time
of the last deploy, for every file alike (an ETag there is that time in hex, then the size), and since E1 a deploy
follows every code push as well as every backup: backups could stop for a week and, with any push in it, the card
would still show a recent date. The build now writes `backup.json`, `{ "at": <ISO> }`, the time of the commit on
the `data` branch that holds the published `cafes.json`, and the card reads that. It says "The latest copy is from
<date>": the backup commits only when something changed, so on a quiet day the date stays put, and that is the
honest reading. Built from main's `cafes.json` (no data branch yet, or a local run) there is no backup date, so there
is no file, and the card says what the backup is rather than when. The service worker treats `backup.json` like
`cafes.json`: network-first, stored under its bare path, so the `?t=` on each request does not leave a cache entry
behind. `tests/site-build.js` serves a real one through the service worker to the card.

## Coffee against coffee (v112)

On 26 Oct a pour over at The Coffee Movement was put against Brian Black Tea. Placing a new cafe looked only at its
verdict: The Coffee Movement was Loved, so it searched the 43 placed Loved cafes, only 5 of them coffee, from the
middle, and the middle was a tea house. With no answers yet the middle never moves, so it was the same question
every time (200 of 200 simulated). On the live list 62% of placing questions and 36% of the others paired two
kinds. The compare audit (27 Oct) measured it; four of its six picks are in.

**One kind (C1).** Every question, placing or not, and every tie Rank a pair settles, is between two cafes of one
kind (`kindPool`, `kindGap`; the kind is `cafeKind`, what you order most there unless you set it). When a kind is
short, tea and matcha stand in for each other and boba leans on both; coffee, gelato and bakeries have no stand-in,
and a cafe with nobody of its kind gets no question. The verdict still narrows the search when the kind has six
or more placed cafes of it. The cost: the overall Best list orders a coffee bar against a tea house by verdict and
by where each stands in its own kind, never by a direct answer. Go already lists each kind on its own. Run on the
live list, 0 of 3,540 questions cross kinds and every save still asks one.

**Nearby and remembered (C2).** The search still says roughly where to look; within two places of that point the
easiest one wins: same region (+1.5 if not), visited in the last 120 days (+1 if not), then the distance. A placed
cafe with no drink logged is no reference unless fewer than three others are. The Coffee Movement now meets Kasama
Cà Phê (California, a month ago) instead of Xi Bo Ba Renon in Bali, which has nothing logged. `chaserApply`
already reads an answer against the cafe actually met, so asking off the point still moves the search correctly,
and `rank-placement.js` (a board of drinkless, regionless cafes) converges exactly as before.

**What is being compared (C3).** The other side shows what you order there ("Usually a Davao Mocha · 1mo ago"),
never only a date; your side shows today's drink, or yours as usual when there is none (Rank a pair). Each side
carries a kind tag, and the question names the kind ("Which coffee would you go back for?") or, when both serve
the drink you just had, the drink.

**A kind you can set (C6).** `cafe.kind` overrides the guess (and the emoji). The form's More has a Kind of place
row that shows the guess and clears back to it on a second tap; the sheet has "Comparing as coffee · Change",
which saves the kind and asks again among the right cafes. Before this an emoji could only say matcha, boba, gelato
or bakery: nothing could say a place was tea or coffee, and Teapresso Bar, whose one drink ("Plantation") says
nothing, counted as coffee. The conflict review lists Kind with the other fields.

Not done: C4 (ways out that record nothing; "Too long ago to say" still records a tie) and C5 (placing progress
and "Place it now") were not picked. The drink guesser reads "oolong" as boba, which the new test ran into; a
cafe whose drinks say oolong tea and is a tea house can now be set to Tea.

## Syncing without a Retry button (v113)

After updating a cafe the bar often stayed at "Saved on this phone · 1 waiting to sync" until Retry sync was
tapped. Two causes. The first was a bug: `flushSync` took the list of waiting cafes once, when it started, and a
save that arrived while it ran found it busy and returned. A ranking answer saves two cafes back to back, so the
second was left behind every time, with nothing that would send it before the next save. A pass now takes every
cafe waiting, including one saved while it runs (reproduced with a stand-in Firebase that takes 50 ms per call:
before, the second cafe stayed waiting; after, both land).

The second: a sync that failed waited for the next save, a sign-in, the phone reporting offline-then-online, or
the button. Phones rarely report offline at a counter with weak Wi-Fi, and a phone just woken has a connection that
takes a while to come back. Now a sync that could not finish tries again by itself, after 3, 10 and 30 seconds and
then every one or two minutes while anything waits (`syncRetryLater`), as soon as Firebase says it is connected
(`.info/connected`, `syncWatch`), and when the app comes back to the screen. The write itself is now held to 30
seconds like the read before it, so a write that never answers cannot hold the queue: if Firebase lands it later,
the next pass finds the cloud already equal to the edit and writes the same value. A save made while the sign-in
script is not loaded fetches it. The same failure on every try is logged once in Problems, not once a try. The
bar says "Waiting to sync · trying again by itself", and Retry sync stays for when you would rather not wait.
