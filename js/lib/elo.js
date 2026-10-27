/* js/lib/elo.js — the arithmetic of the ranking: Elo, each cafe's own K, and placing a newcomer by search.

   Pure: every function takes cafes (or numbers) and returns numbers, and none reads the board or writes a cafe.
   rank.js decides who meets whom and saves the result; this decides what a result is worth, which is the part
   worth testing on its own (tests/unit/elo.test.mjs). Like js/lib/text.js, the app gets these as globals. */

export const ELO_BASE = 1500;
/* A cafe is PROVISIONAL until it has been compared this many times. While it is, it is placed by a
   search (placementPos/placementElo below), not nudged by Elo, and it is not yet used as a yardstick. */
export const PLACING = 5;

/** @param {any} c a cafe @returns {number} */
export function eloFor(c) {
  return c && typeof c.elo === "number" ? c.elo : ELO_BASE;
}
/** @param {any} c a cafe @returns {number} */
export function matchCount(c) {
  return (c && c.matches) || 0;
}
/** @param {any} c a cafe @returns {boolean} */
export function isProvisional(c) {
  return matchCount(c) < PLACING;
}
/* Every cafe moves by its OWN K, so a newcomer moves a lot and a veteran barely moves, whoever won.
   It used to be the winner's count alone, so a veteran beating a newcomer cost the newcomer 5 points
   and a newcomer beating a veteran moved both by 22. */
/** @param {any} c a cafe @returns {number} */
export function kFor(c) {
  return Math.max(16, 40 - 6 * matchCount(c));
}
/** One key for a pair, whichever way round it is asked. @param {string} a @param {string} b */
export function pairKey(a, b) {
  return [a, b].sort().join("###");
}
/** The chance A beats B, by their ratings. @param {number} Ra @param {number} Rb @returns {number} 0..1 */
export function expectedScore(Ra, Rb) {
  return 1 / (1 + Math.pow(10, (Rb - Ra) / 400));
}
/* Ordinary Elo for one comparison, each side at its own K. A win always moves both by at least a point, so a
   heavy favourite winning is never a no-op; a draw moves each towards the other by what the gap predicted. */
/** @param {number} Ra @param {number} Rb @param {number} Ka @param {number} Kb @param {boolean} draw
 *  @returns {{a: number, b: number}} the new ratings, A having won (or drawn) */
export function eloStep(Ra, Rb, Ka, Kb, draw) {
  const Ea = expectedScore(Ra, Rb);
  return {
    a: Ra + (draw ? Math.round(Ka * (0.5 - Ea)) : Math.max(1, Math.round(Ka * (1 - Ea)))),
    b: Rb - (draw ? Math.round(Kb * (0.5 - Ea)) : Math.max(1, Math.round(Kb * (1 - Ea)))),
  };
}
/** Where an Elo falls among references sorted best first, as a fractional index (past either end: a little out).
 *  @param {number} e @param {any[]} refs @returns {number} */
export function placementPos(e, refs) {
  const n = refs.length;
  if (e >= eloFor(refs[0])) return -Math.min(4, (e - eloFor(refs[0])) / 25);
  for (let i = 1; i < n; i++) {
    const hi = eloFor(refs[i - 1]),
      lo = eloFor(refs[i]);
    if (e >= lo) return hi > lo ? i - 1 + (hi - e) / (hi - lo) : i;
  }
  return n - 1 + Math.min(4, (eloFor(refs[n - 1]) - e) / 25);
}
/** The inverse: the Elo at a position among the references. Past either end it extends a little.
 *  @param {any[]} refs @param {number} r @returns {number} */
export function placementElo(refs, r) {
  const n = refs.length;
  if (r <= 0) return Math.round(eloFor(refs[0]) + Math.min(40, -r * 10 + 8));
  if (r >= n - 1) return Math.round(eloFor(refs[n - 1]) - Math.min(40, (r - (n - 1)) * 10 + 8));
  const i = Math.floor(r),
    f = r - i;
  return Math.round(eloFor(refs[i]) + (eloFor(refs[i + 1]) - eloFor(refs[i])) * f);
}
/** How far one answer moves a cafe that has had m comparisons among n references: a quarter of the list, then a
 *  sixth... never less than a few places. @param {number} m @param {number} n @returns {number} */
export function placementStep(m, n) {
  return Math.max(Math.min(3, n / 6), n / (2 * (m + 2)));
}

if (typeof window !== "undefined")
  Object.assign(window, { ELO_BASE, PLACING, eloFor, matchCount, isProvisional, kFor, pairKey, expectedScore, eloStep, placementPos, placementElo, placementStep });
