/* js/lib/crop.js — finding the receipt in a photo (v134).

   A photo of a receipt is mostly not receipt: a hand, a cup, a counter. The text reader (js/scan.js) is told the picture
   is one block of print, so it made lines out of all of it: on the owner's first real photo, 20 lines of junk from a steel
   pot's holes around 8 lines of ticket. An audit on 12 Nov measured a crop: on twelve photos the lines read right went
   from 64 to 93 of 131 and the junk from 60 lines to 6, and a receipt tilted 12 degrees went from 2 lines right to all 13
   once it was stood upright.

   So: a receipt is the bright, roughly rectangular thing with print on it, nearest the middle. The photo is cut at
   several brightnesses, since "bright" depends on what else is in it; each bright patch is measured for how
   rectangular it is, whether there are dark specks of print on it, and how central it is, and the best one wins. Its
   lean comes from how its pixels spread, which is what lets the caller stand it upright.

   It gives up rather than guess: no answer when nothing looks like paper (a white table, a hard shadow across the
   receipt, a dark screen) or when the paper already fills the photo. The caller then reads the whole photo, as before.

   It works on brightness alone, as plain arrays, so it knows nothing of canvases and Node can test it.

   Since v135 the owner sets the cut: "so I have to crop it myself". What is found here is only where the box starts
   (foundCorners); its four corners are dragged onto the receipt's, each on its own, and flatten pulls what is inside
   them square. Four free corners say more than a box and a lean: a receipt photographed from an angle is a
   trapezium, and flattening undoes that as well as the tilt.
   Like the other lib files, the app gets these as globals. */

/* the long side, in pixels, of the two pictures findReceipt wants: one to find the paper, a finer one to see print */
export const CROP_SMALL = 256;
export const CROP_MID = 640;

const MIN_AREA = 0.015; /* of the photo: smaller is a label or a glint */
const MAX_AREA = 0.85;
const MIN_FILL = 0.72; /* of its own rectangle: less is a blob, or paper joined to something else */
const MIN_INK = 0.004; /* of the paper, darker than it: none is a blank wall, a great deal is not paper */
const MAX_INK = 0.4;
const FILLS_PHOTO = 0.9; /* this much of the width and the height: there is nothing to cut away */
const UPRIGHT = 1.5; /* degrees: a lean under this is left alone, since turning a picture softens it */
const PAD = 0.04; /* of the longer side, kept around the paper */

/** A picture's brightness, a number from 0 to 255 for each pixel, row by row. @typedef {{Y: Uint8Array, w: number, h: number}} Grey */
/** Where the receipt is, in the small picture's pixels: its middle, its size with a margin, and its lean in degrees
    (clockwise, as a canvas turns). Turn the photo back by `angle` about (cx, cy) and it is a w by h upright rectangle.
    @typedef {{cx: number, cy: number, w: number, h: number, angle: number}} Found */

/** The brightness that best splits dark from light, among those from `from` up. @param {Uint32Array} hist @param {number} from */
function split(hist, from) {
  let total = 0,
    sum = 0;
  for (let i = from; i < 256; i++) {
    total += hist[i];
    sum += i * hist[i];
  }
  let wB = 0,
    sB = 0,
    best = from,
    bestV = -1;
  for (let i = from; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sB += i * hist[i];
    const d = sB / wB - (sum - sB) / wF;
    const v = wB * wF * d * d;
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  }
  return best;
}
/** Each pixel becomes on if any within r of it is (grow), or only if all are (shrink). @param {Uint8Array} m @param {number} w
    @param {number} h @param {number} r @param {boolean} grow */
function spread(m, w, h, r, grow) {
  /** @param {Uint8Array} src @param {boolean} across */
  const pass = function (src, across) {
    const out = new Uint8Array(w * h);
    const n = across ? w : h,
      lines = across ? h : w;
    for (let l = 0; l < lines; l++) {
      /** @param {number} i */
      const at = i => (across ? l * w + i : i * w + l);
      let run = 0;
      for (let i = 0; i < Math.min(n, r + 1); i++) run += src[at(i)];
      for (let i = 0; i < n; i++) {
        const lo = Math.max(0, i - r),
          hi = Math.min(n - 1, i + r);
        out[at(i)] = grow ? (run > 0 ? 1 : 0) : run === hi - lo + 1 ? 1 : 0;
        if (i + r + 1 < n) run += src[at(i + r + 1)];
        if (i - r >= 0) run -= src[at(i - r)];
      }
    }
    return out;
  };
  return pass(pass(m, true), false);
}

/** The receipt in a photo, or null when nothing in it is plainly one or it already fills the photo.
    @param {Grey} small the photo about CROP_SMALL on its long side @param {Grey} mid the same photo about CROP_MID
    @returns {Found|null} */
export function findReceipt(small, mid) {
  const Y = small.Y,
    w = small.w,
    h = small.h;
  if (!(w >= 8 && h >= 8) || Y.length < w * h || mid.Y.length < mid.w * mid.h) return null;
  const hist = new Uint32Array(256);
  for (let p = 0; p < w * h; p++) hist[Y[p]]++;
  /* "bright" is relative: dark from light, then again within the light, and again, with the steps between */
  const t1 = split(hist, 0),
    t2 = split(hist, t1 + 1),
    t3 = split(hist, t2 + 1);
  const cuts = [...new Set([t1, Math.round((t1 + t2) / 2), t2, Math.round((t2 + t3) / 2), t3])].filter(t => t > 40 && t < 250);
  const kk = mid.w / w;
  /** @type {(Found & {score: number, x0: number, x1: number, y0: number, y1: number})|null} */
  let best = null;
  const stack = new Int32Array(w * h);
  for (const T of cuts) {
    let m = new Uint8Array(w * h);
    for (let p = 0; p < m.length; p++) m[p] = Y[p] > T ? 1 : 0;
    m = spread(spread(m, w, h, 1, true), w, h, 1, false); /* print does not make holes in the paper */
    m = spread(spread(m, w, h, 2, false), w, h, 2, true); /* thin bridges to other bright things go */
    const seen = new Uint8Array(w * h);
    for (let s = 0; s < m.length; s++) {
      if (!m[s] || seen[s]) continue;
      /* one bright patch: its pixels, its edges and where it balances */
      let top = 0;
      stack[top++] = s;
      seen[s] = 1;
      /** @type {number[]} */
      const px = [];
      let x0 = w,
        x1 = 0,
        y0 = h,
        y1 = 0,
        sx = 0,
        sy = 0;
      while (top) {
        const p = stack[--top];
        px.push(p);
        const x = p % w,
          y = (p - x) / w;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        sx += x;
        sy += y;
        if (x > 0 && m[p - 1] && !seen[p - 1]) (seen[p - 1] = 1), (stack[top++] = p - 1);
        if (x < w - 1 && m[p + 1] && !seen[p + 1]) (seen[p + 1] = 1), (stack[top++] = p + 1);
        if (y > 0 && m[p - w] && !seen[p - w]) (seen[p - w] = 1), (stack[top++] = p - w);
        if (y < h - 1 && m[p + w] && !seen[p + w]) (seen[p + w] = 1), (stack[top++] = p + w);
      }
      const area = px.length,
        frac = area / (w * h);
      if (frac < MIN_AREA || frac > MAX_AREA) continue;
      /* against three edges of the photo it is the table, not a paper on it */
      if (+(x0 === 0) + +(y0 === 0) + +(x1 === w - 1) + +(y1 === h - 1) >= 3) continue;
      /* its lean: the direction its pixels spread furthest, when it is plainly longer one way */
      const mx = sx / area,
        my = sy / area;
      let xx = 0,
        yy = 0,
        xy = 0;
      for (const p of px) {
        const x = (p % w) - mx,
          y = (p - (p % w)) / w - my;
        xx += x * x;
        yy += y * y;
        xy += x * y;
      }
      const both = Math.sqrt(4 * xy * xy + (xx - yy) * (xx - yy));
      let lean = 0;
      if ((xx + yy + both) / Math.max(1e-6, xx + yy - both) > 1.25) {
        const deg = (0.5 * Math.atan2(2 * xy, xx - yy) * 180) / Math.PI;
        lean = Math.abs(deg) > 45 ? deg - Math.sign(deg) * 90 : deg;
      }
      const a = (lean * Math.PI) / 180,
        ca = Math.cos(a),
        sa = Math.sin(a);
      let u0 = Infinity,
        u1 = -Infinity,
        v0 = Infinity,
        v1 = -Infinity;
      for (const p of px) {
        const x = p % w,
          y = (p - x) / w;
        const u = x * ca + y * sa,
          v = y * ca - x * sa;
        if (u < u0) u0 = u;
        if (u > u1) u1 = u;
        if (v < v0) v0 = v;
        if (v > v1) v1 = v;
      }
      const rw = u1 - u0 + 1,
        rh = v1 - v0 + 1;
      const fill = area / (rw * rh);
      if (fill < MIN_FILL) continue;
      /* print: how much of its middle is clearly darker than the paper, in the finer picture */
      const bx0 = Math.round((x0 + (x1 - x0) * 0.1) * kk),
        bx1 = Math.min(mid.w - 1, Math.round((x1 - (x1 - x0) * 0.1) * kk)),
        by0 = Math.round((y0 + (y1 - y0) * 0.1) * kk),
        by1 = Math.min(mid.h - 1, Math.round((y1 - (y1 - y0) * 0.1) * kk));
      const hh = new Uint32Array(256);
      let n = 0;
      for (let y = by0; y <= by1; y++)
        for (let x = bx0; x <= bx1; x++) {
          hh[mid.Y[y * mid.w + x]]++;
          n++;
        }
      if (!n) continue;
      let paper = 255;
      for (let c = hh[paper]; paper > 0 && c < n * 0.2; ) c += hh[--paper];
      let dark = 0;
      for (let i = 0; i < paper - 45; i++) dark += hh[i];
      const ink = dark / n;
      if (ink < MIN_INK || ink > MAX_INK) continue;
      /* people point the camera at the receipt: of two papers, the one nearer the middle is it */
      const off = Math.hypot((x0 + x1) / 2 / w - 0.5, (y0 + y1) / 2 / h - 0.5) / Math.SQRT1_2;
      const score = frac * fill * fill * Math.pow(Math.max(0, 1 - off), 1.5);
      if (best && score <= best.score) continue;
      const uc = (u0 + u1) / 2,
        vc = (v0 + v1) / 2;
      best = { score: score, x0: x0, x1: x1, y0: y0, y1: y1, cx: uc * ca - vc * sa, cy: uc * sa + vc * ca, w: rw, h: rh, angle: lean };
    }
  }
  if (!best) return null;
  const bw = best.x1 - best.x0 + 1,
    bh = best.y1 - best.y0 + 1;
  if (bw >= w * FILLS_PHOTO && bh >= h * FILLS_PHOTO) return null;
  if (Math.abs(best.angle) < UPRIGHT) {
    const pad = Math.max(bw, bh) * PAD;
    return { cx: (best.x0 + best.x1 + 1) / 2, cy: (best.y0 + best.y1 + 1) / 2, w: bw + 2 * pad, h: bh + 2 * pad, angle: 0 };
  }
  const pad = Math.max(best.w, best.h) * PAD;
  return { cx: best.cx + 0.5, cy: best.cy + 0.5, w: best.w + 2 * pad, h: best.h + 2 * pad, angle: best.angle };
}

/** A box's four corners, clockwise from the top left as you look at it, each [x, y]. @typedef {number[][]} Quad */

/** The corners of what findReceipt found: where the box starts. @param {Found} f @returns {Quad} */
export function foundCorners(f) {
  const a = (f.angle * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a),
    hw = f.w / 2,
    hh = f.h / 2;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(p => [f.cx + p[0] * c - p[1] * s, f.cy + p[0] * s + p[1] * c]);
}
/** Could a receipt be in this box? Its corners still go round clockwise with none folded inward, and no side is
    shorter than `least`. A corner dragged past another fails, so the drag is not taken. @param {Quad} q @param {number} least */
export function quadOk(q, least) {
  if (!Array.isArray(q) || q.length !== 4 || q.some(p => !Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return false;
  for (let i = 0; i < 4; i++) {
    const a = q[i],
      b = q[(i + 1) % 4],
      c = q[(i + 2) % 4];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < least) return false;
    /* down is positive y, so a clockwise turn is a positive cross product */
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) <= 0) return false;
  }
  return true;
}
/** The size of the upright picture a box flattens to: each pair of opposite sides, averaged. @param {Quad} q */
export function quadSize(q) {
  /** @param {number} i @param {number} j */
  const d = (i, j) => Math.hypot(q[j][0] - q[i][0], q[j][1] - q[i][1]);
  return { w: (d(0, 1) + d(3, 2)) / 2, h: (d(0, 3) + d(1, 2)) / 2 };
}
/** Pulls the box square: the picture inside four corners, as an upright ow by oh picture. Each point of the answer is
    looked up in the photo through the one projection that takes a square's corners to the box's (Heckbert, 1989), and
    takes the blend of the four pixels around where it lands.
    @param {Uint8ClampedArray|Uint8Array} src the photo, four numbers a pixel @param {number} sw @param {number} sh
    @param {Quad} q in the photo's pixels @param {number} ow @param {number} oh @returns {Uint8ClampedArray} */
export function flatten(src, sw, sh, q, ow, oh) {
  const out = new Uint8ClampedArray(ow * oh * 4);
  const x0 = q[0][0],
    y0 = q[0][1],
    x1 = q[1][0],
    y1 = q[1][1],
    x2 = q[2][0],
    y2 = q[2][1],
    x3 = q[3][0],
    y3 = q[3][1];
  const dx1 = x1 - x2,
    dx2 = x3 - x2,
    dy1 = y1 - y2,
    dy2 = y3 - y2,
    sx = x0 - x1 + x2 - x3,
    sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = den ? (sx * dy2 - dx2 * sy) / den : 0,
    h = den ? (dx1 * sy - sx * dy1) / den : 0;
  const a = x1 - x0 + g * x1,
    b = x3 - x0 + h * x3,
    d = y1 - y0 + g * y1,
    e = y3 - y0 + h * y3;
  for (let oy = 0, o = 0; oy < oh; oy++) {
    const v = (oy + 0.5) / oh;
    for (let ox = 0; ox < ow; ox++, o += 4) {
      const u = (ox + 0.5) / ow;
      const z = g * u + h * v + 1;
      /* a pixel's colour sits at its middle, hence the halves */
      const x = Math.min(sw - 1, Math.max(0, (a * u + b * v + x0) / z - 0.5)),
        y = Math.min(sh - 1, Math.max(0, (d * u + e * v + y0) / z - 0.5));
      const xi = Math.min(sw - 2, Math.floor(x)),
        yi = Math.min(sh - 2, Math.floor(y));
      const fx = x - xi,
        fy = y - yi;
      const p = (yi * sw + xi) * 4,
        r = p + sw * 4;
      for (let ch = 0; ch < 3; ch++)
        out[o + ch] = (src[p + ch] * (1 - fx) + src[p + 4 + ch] * fx) * (1 - fy) + (src[r + ch] * (1 - fx) + src[r + 4 + ch] * fx) * fy;
      out[o + 3] = 255;
    }
  }
  return out;
}

if (typeof window !== "undefined") Object.assign(window, { CROP_SMALL, CROP_MID, findReceipt, foundCorners, quadOk, quadSize, flatten });
