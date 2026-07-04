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
