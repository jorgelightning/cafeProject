/* config.js — API keys and app settings — edit GMAPS_KEY_ENC / FIREBASE_CONFIG here.
   Loaded by index.html; script order matters (config first, boot last). */
"use strict";
/* ============================================================
STEP 1 — PASTE YOUR *CAESAR-ENCODED* KEY BELOW.
Generate it with the console snippet in the page instructions.
(Light deterrent only: the decoded key still reaches the browser.)
============================================================ */
const GMAPS_KEY_ENC = "HPghZfJAcuuHITOQI9ZJ-BMszolL6X9GRmgTNhr";
const CAESAR_SHIFT = 7;
function caesar(s,k){ return s.replace(/./g,c=>{ const o=c.charCodeAt(0); if(o>=65&&o<=90)return String.fromCharCode((o-65+k%26+26)%26+65); if(o>=97&&o<=122)return String.fromCharCode((o-97+k%26+26)%26+97); if(o>=48&&o<=57)return String.fromCharCode((o-48+k%10+10)%10+48); return c; }); }
const GMAPS_KEY = caesar(GMAPS_KEY_ENC, -CAESAR_SHIFT);
/* ============================================================ */
/* ============================================================
FIREBASE (cloud sync) — paste your project's web config below.
One-time setup (~3 min):
1) console.firebase.google.com → Add project.
2) Build → Realtime Database → Create database → Start in test mode.
3) Project settings → Your apps → Web (</>) → register → copy the config.
4) Paste the values below (databaseURL is the important one).
5) Authentication → Sign-in method → enable Google sign-in, then Realtime Database → Rules → paste this and Publish: { "rules": { "cafes": { ".read": true, ".write": "auth != null && auth.token.email === 'jorgemarco.portillo@gmail.com'" } } }
After this, your signed-in account's edits save to the cloud instantly for all viewers — no more cafes.json uploads.
NOTE: public read is expected for a shared map; writes are locked to your Google account so no one else can overwrite your data.
============================================================ */
const FIREBASE_CONFIG = {
apiKey: "AIzaSyDoTgqNZjj7oyoeulJAiqNvPMCGltUbrio",
authDomain: "cafeproject-b604f.firebaseapp.com",
databaseURL: "https://cafeproject-b604f-default-rtdb.firebaseio.com",
projectId: "cafeproject-b604f",
storageBucket: "cafeproject-b604f.firebasestorage.app",
messagingSenderId: "846570702792",
appId: "1:846570702792:web:5899133d9032437e14e2fd"
};
const KEY="cafemap.v1";
const DATA_URL="cafes.json";          // published data committed to your GitHub repo
const ADMIN_FLAG="cafemap.admin";     // remembers admin mode in this browser
const DIRTY_FLAG="cafemap.dirty";     // set on local edits, cleared on Export
const OWNER_EMAIL="jorgemarco.portillo@gmail.com"; // only this Google account can edit (real security)
const ADMIN_PASS="cafeAdmin";         // change this — only hides editing UI (not real security)
const DEFAULT_CENTER=[21.300,-157.830]; // Honolulu [lat,lng]
const ALL_TAGS=["cozy","good wifi","oat milk","outdoor","quiet","pastries","specialty","matcha","to-go"];
/* ---------- currency ----------
A cafe's currency is a fact about its country, so it is keyed on the ISO 3166-1 alpha-2
code Google's Places result gives us (stored as c.cc when the cafe is picked). It is
deliberately NOT derived from countryTerms(): that is a ladder of lat/lng rectangles whose
contiguous-US box also contains Vancouver, Toronto and Montreal, so it would bill Canadian
coffee in US dollars. Anything missing here falls back to USD. */
const CCY_BY_CC={ US:"USD", CA:"CAD", MX:"MXN", GB:"GBP", CH:"CHF", SE:"SEK", NO:"NOK", DK:"DKK", CZ:"CZK", PL:"PLN", HU:"HUF", TR:"TRY",
AT:"EUR", BE:"EUR", CY:"EUR", DE:"EUR", EE:"EUR", ES:"EUR", FI:"EUR", FR:"EUR", GR:"EUR", HR:"EUR", IE:"EUR", IT:"EUR", LT:"EUR", LU:"EUR", LV:"EUR", MT:"EUR", NL:"EUR", PT:"EUR", SI:"EUR", SK:"EUR",
JP:"JPY", KR:"KRW", TW:"TWD", HK:"HKD", MO:"MOP", CN:"CNY", SG:"SGD", MY:"MYR", TH:"THB", VN:"VND", PH:"PHP", ID:"IDR", IN:"INR",
AU:"AUD", NZ:"NZD", AE:"AED", IL:"ILS", ZA:"ZAR", BR:"BRL", AR:"ARS", CL:"CLP", CO:"COP", PE:"PEN" };
/* sym = what goes in front of the amount. dec = how many decimals a price is *written* with
   on a menu in that country, which is not always the ISO 4217 minor unit: bubble tea in
   Taipei is NT$65, never NT$65.00. The USD side of every drink always keeps 2. */
const CCY_META={ USD:{sym:"$",dec:2}, EUR:{sym:"€",dec:2}, GBP:{sym:"£",dec:2}, CAD:{sym:"CA$",dec:2}, AUD:{sym:"A$",dec:2}, NZD:{sym:"NZ$",dec:2},
CHF:{sym:"CHF ",dec:2}, SEK:{sym:"kr",dec:2}, NOK:{sym:"kr",dec:2}, DKK:{sym:"kr",dec:2}, CZK:{sym:"Kč",dec:0}, PLN:{sym:"zł",dec:2}, HUF:{sym:"Ft",dec:0}, TRY:{sym:"₺",dec:2},
JPY:{sym:"¥",dec:0}, KRW:{sym:"₩",dec:0}, TWD:{sym:"NT$",dec:0}, HKD:{sym:"HK$",dec:1}, MOP:{sym:"MOP$",dec:1}, CNY:{sym:"¥",dec:1}, SGD:{sym:"S$",dec:2}, MYR:{sym:"RM",dec:2},
THB:{sym:"฿",dec:0}, VND:{sym:"₫",dec:0}, PHP:{sym:"₱",dec:0}, IDR:{sym:"Rp",dec:0}, INR:{sym:"₹",dec:0}, MXN:{sym:"MX$",dec:2}, AED:{sym:"AED ",dec:2}, ILS:{sym:"₪",dec:2},
ZAR:{sym:"R",dec:2}, BRL:{sym:"R$",dec:2}, ARS:{sym:"AR$",dec:0}, CLP:{sym:"CLP$",dec:0}, COP:{sym:"COP$",dec:0}, PEN:{sym:"S/",dec:2} };
/* Units of the local currency per 1 US dollar. HAND-MAINTAINED AND APPROXIMATE — spot-check
   before trusting a total. This staleness is survivable by design: the rate is copied onto
   each drink at the moment it is logged (drink.pr) and never consulted again, so refreshing
   this table moves future entries only and can never rewrite a price already recorded.
   To move to live rates, change fxRate() in core.js; nothing else reads this. */
const FX_PER_USD={ USD:1, EUR:0.92, GBP:0.79, CAD:1.37, AUD:1.52, NZD:1.66, CHF:0.88, SEK:10.5, NOK:10.7, DKK:6.85, CZK:23.2, PLN:3.95, HUF:355, TRY:34.0,
JPY:147, KRW:1330, TWD:31.5, HKD:7.8, MOP:8.03, CNY:7.15, SGD:1.34, MYR:4.45, THB:34.5, VND:25400, PHP:57.5, IDR:16000, INR:83.5,
MXN:18.5, AED:3.67, ILS:3.70, ZAR:18.2, BRL:5.45, ARS:1010, CLP:945, COP:4100, PEN:3.75 };
const FX_ASOF="2026-08-25";       // date stamped onto drinks logged against this table
/* Historical anchors, for drinks logged long after they were drunk — which is most of the
   foreign ones, since a trip gets typed up after you are home. Sparse on purpose: add a
   currency only for months where the rate had moved enough to matter, and the lookup takes
   the newest anchor on or before the drink's date, falling back to the table above.
   fxRateAt() reports which date it actually used, and that is what gets stored on the drink
   and shown in the form — a rate is never labelled with a date it did not come from.
   Add entries like:
     "2025-01": { TWD:32.8, JPY:157 },
   oldest first. Empty is a valid state: every drink then converts at the current table and
   says so. */
const FX_HISTORY={};
/* Where real rates come from. Frankfurter serves ECB reference rates, needs no key, and
   answers a dated path — /2025-01-10?from=USD&to=TWD — with the rate for that day, or the
   working day before it if that date was a weekend. It reports the date it actually used,
   which is what gets stored, so a Sunday coffee is never labelled with a Sunday rate that
   does not exist. This runs in the browser, not here, so it is the one part of the currency
   work that could not be exercised before shipping — if it is ever unreachable the tables
   above still answer and nothing blocks. Set to "" to switch it off entirely. */
const FX_API="https://api.frankfurter.app/";
