/* js/lib/text.js — text helpers with no state and no DOM: escaping, a URL check, a spelling distance, dates.

   These are the first of the app's code to be real ES modules (engineering audit, 27 Oct). Each is imported by
   tests/unit/*.test.mjs and run by Node on its own, with no browser and no slicing of core.js; the app gets the
   same functions as globals at the bottom of this file, so the classic scripts call esc() exactly as before.
   index.html loads this as <script type="module"> ahead of the app's deferred scripts, which keeps the order. */

/* The apostrophe matters: an action's arguments (core.js act()) are JSON inside a double-quoted attribute, and a
   cafe called Joe's sits in markup everywhere, so every character that can end an attribute or a tag is escaped. */
/** @param {any} s @returns {string} */
export function esc(s) {
  return (s == null ? "" : String(s)).replace(
    /[&<>"']/g,
    m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]
  );
}
/* A photo or link URL that is safe to put in an attribute or url(): http(s) or an inline image, else "".
   encodeURIComponent leaves ' ( ) as they are (they are "unreserved" to it), so until its first unit test (27 Oct)
   a URL holding ') passed straight through and closed rank.js's url('...') early. Those three get spelled out. */
/** @param {any} u @returns {string} */
export function safeUrl(u) {
  u = (u == null ? "" : String(u)).trim();
  if (!u) return "";
  if (!/^(https?:|data:image\/)/i.test(u)) return "";
  return u.replace(/["'()<>\s\\]/g, c => encodeURIComponent(c).replace(/['()]/g, x => "%" + x.charCodeAt(0).toString(16).toUpperCase()));
}
/* Levenshtein, bailing out as soon as the distance exceeds what the caller cares about —
   this runs against every name you have ever logged, on every save. */
/** @param {any} a @param {any} b @param {number} max @returns {number} the distance, or max + 1 once past it */
export function editDistance(a, b, max) {
  a = String(a || "");
  b = String(b || "");
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = [],
    cur = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let best = cur[0];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur.slice();
  }
  return prev[b.length];
}
/** "2026-09-01" -> "Sep 1, 2026"; anything else comes back as it was. @param {any} s @returns {string} */
export function fmtDate(s) {
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m[2] - 1];
  return mo + " " + +m[3] + ", " + m[1];
}
/* The options of an order as one quiet line — "8 oz · oat · no sugar · warm" — the same phrasing the quick cup
   uses. (Until the UI audit, 26 Oct, they were four pills in four colours.) */
/** @param {any} o an order @returns {string} */
export function orderOptsText(o) {
  if (!o) return "";
  return [
    o.size || "",
    o.milk ? String(o.milk).toLowerCase() : "",
    o.sweet ? (o.sweet === "0%" ? "no sugar" : o.sweet + " sweet") : "",
    o.ice ? String(o.ice).toLowerCase() : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

if (typeof window !== "undefined") Object.assign(window, { esc, safeUrl, editDistance, fmtDate, orderOptsText });
