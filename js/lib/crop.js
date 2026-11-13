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

   Since v136 the cut-out is cleaned before it is read (readable). The owner sent six of his own photos and each
   clean-up was measured on them and on his first ticket, cut out by hand: evening the light took the lines read right
   from 76 to 87 of 119 and a receipt under a hard shadow from 8 to 15 of 18, and leaving colour out took the pink
   end-of-roll stripes off another's prices. Darker print, sharpening, pure black and white and enlarging were tried
   too and did not help on real photos, though darker print had looked good on generated ones.
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

/** A picture's brightness, a number from 0 to 255 for each pixel, row by row. `plain`, when it is there, marks the pixels
    that are no warmer in colour than the photo's own white: paper and a pale table are, a hand and a wooden counter are
    not. @typedef {{Y: Uint8Array, w: number, h: number, plain?: Uint8Array}} Grey */
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

/* Print (v138). A receipt on a pale table has no bright edge to find: on the owner's seven photos the box started on the
   receipt twice. But a receipt is also where the print is, whatever it lies on. A pixel is print when it is clearly
   darker than the small patch around it, which holds in shadow as in light and which a thin stroke is but the middle
   of a dark thing is not; the photo is cut into cells, a cell with some print in it but not mostly print is a cell of
   text, and cells of text that touch are a block. The creases of a hand and the grain of a counter are thin and dark
   too, and joined everything into one block, so print only counts where the photo is not warm in colour (Grey.plain). */
const INK = 0.8; /* this much of the brightness around it, or less, is print */
const INK_LEAST = 14; /* …and at least this much darker, so grain on a dark table is not print */
const TEXT_LEAST = 0.03; /* of a cell: less is a speck */
const TEXT_MOST = 0.5; /* more is a dark thing, not words on a light one */
const BLOCK_LEAST = 6; /* cells: fewer is a label */
const WHOLE = 0.8; /* this much of a block inside the paper found, and the paper holds it */
const PART = 0.2; /* this much of it inside, and no more than that, and the paper has cut it */
const MOST = 0.85; /* of the photo: a block this large says nothing about where the receipt is */
const LOOSE = 2.2; /* paper this many times the size of the print it holds is not that print's paper */
const PRINT_PAD = 0.14; /* of a block's shorter side, kept round it: about a receipt's own margin */

/** The blocks of print in a photo, the likeliest receipt first: the biggest, nearest the middle.
    @param {Grey} g the photo about CROP_MID on its long side
    @returns {{cells: number[][], cx: number, cy: number, w: number, h: number, angle: number}[]} each with the middles of
    its cells and the upright rectangle round its print, in the picture's pixels */
function printBlocks(g) {
  const w = g.w,
    h = g.h,
    Y = g.Y;
  if (!(w >= 32 && h >= 32) || Y.length < w * h) return [];
  /* the brightness around each pixel: a running total, so any patch costs four lookups */
  const row = w + 1;
  const sum = new Float64Array(row * (h + 1));
  for (let y = 0, p = 0; y < h; y++) for (let x = 0; x < w; x++, p++) sum[(y + 1) * row + x + 1] = Y[p] + sum[y * row + x + 1] + sum[(y + 1) * row + x] - sum[y * row + x];
  const r = Math.max(2, Math.round(Math.max(w, h) / 160));
  const cs = Math.max(8, Math.round(Math.max(w, h) / 40));
  const plain = g.plain && g.plain.length >= w * h ? g.plain : null;
  const gw = Math.ceil(w / cs),
    gh = Math.ceil(h / cs);
  const ink = new Uint8Array(w * h);
  const dens = new Float32Array(gw * gh),
    size = new Uint16Array(gw * gh);
  for (let y = 0, p = 0; y < h; y++) {
    const y0 = Math.max(0, y - r),
      y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++, p++) {
      const x0 = Math.max(0, x - r),
        x1 = Math.min(w, x + r + 1);
      const mean = (sum[y1 * row + x1] - sum[y0 * row + x1] - sum[y1 * row + x0] + sum[y0 * row + x0]) / ((x1 - x0) * (y1 - y0));
      const c = Math.floor(y / cs) * gw + Math.floor(x / cs);
      size[c]++;
      if (Y[p] < mean * INK && mean - Y[p] > INK_LEAST && (!plain || plain[p])) {
        ink[p] = 1;
        dens[c]++;
      }
    }
  }
  const text = new Uint8Array(gw * gh);
  for (let c = 0; c < text.length; c++) {
    const d = dens[c] / Math.max(1, size[c]);
    text[c] = d >= TEXT_LEAST && d <= TEXT_MOST ? 1 : 0;
  }
  /* lines of large print are a cell or two apart: a cell between two cells of text, up and down, joins them */
  const joined = new Uint8Array(text);
  for (let y = 0; y < gh; y++)
    for (let x = 0; x < gw; x++) {
      if (text[y * gw + x]) continue;
      const up = (y > 0 && text[(y - 1) * gw + x]) || (y > 1 && text[(y - 2) * gw + x]),
        down = (y < gh - 1 && text[(y + 1) * gw + x]) || (y < gh - 2 && text[(y + 2) * gw + x]);
      if (up && down) joined[y * gw + x] = 1;
    }
  const seen = new Uint8Array(gw * gh);
  /** @type {{cells: number[][], cx: number, cy: number, w: number, h: number, angle: number, score: number}[]} */
  const out = [];
  for (let s = 0; s < joined.length; s++) {
    if (!joined[s] || seen[s]) continue;
    const stack = [s];
    seen[s] = 1;
    /** @type {number[]} */
    const cells = [];
    while (stack.length) {
      const c = /** @type {number} */ (stack.pop());
      const x = c % gw,
        y = (c - x) / gw;
      if (text[c]) cells.push(c);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const n = ny * gw + nx;
          if (joined[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
    }
    if (cells.length < BLOCK_LEAST) continue;
    /* its lean and its rectangle, from the print itself, as findReceipt takes them from the paper */
    let n = 0,
      sx = 0,
      sy = 0;
    /** @param {(x: number, y: number) => void} fn */
    const each = function (fn) {
      for (const c of cells) {
        const cx0 = (c % gw) * cs,
          cy0 = ((c - (c % gw)) / gw) * cs;
        for (let y = cy0; y < Math.min(h, cy0 + cs); y++) for (let x = cx0; x < Math.min(w, cx0 + cs); x++) if (ink[y * w + x]) fn(x, y);
      }
    };
    each(function (x, y) {
      n++;
      sx += x;
      sy += y;
    });
    if (!n) continue;
    const mx = sx / n,
      my = sy / n;
    let xx = 0,
      yy = 0,
      xy = 0;
    each(function (x, y) {
      xx += (x - mx) * (x - mx);
      yy += (y - my) * (y - my);
      xy += (x - mx) * (y - my);
    });
    const both = Math.sqrt(4 * xy * xy + (xx - yy) * (xx - yy));
    let lean = 0;
    if ((xx + yy + both) / Math.max(1e-6, xx + yy - both) > 1.25) {
      const deg = (0.5 * Math.atan2(2 * xy, xx - yy) * 180) / Math.PI;
      lean = Math.abs(deg) > 45 ? deg - Math.sign(deg) * 90 : deg;
    }
    if (Math.abs(lean) < UPRIGHT) lean = 0;
    const a = (lean * Math.PI) / 180,
      ca = Math.cos(a),
      sa = Math.sin(a);
    let u0 = Infinity,
      u1 = -Infinity,
      v0 = Infinity,
      v1 = -Infinity;
    each(function (x, y) {
      const u = x * ca + y * sa,
        v = y * ca - x * sa;
      if (u < u0) u0 = u;
      if (u > u1) u1 = u;
      if (v < v0) v0 = v;
      if (v > v1) v1 = v;
    });
    const rw = u1 - u0 + 1,
      rh = v1 - v0 + 1,
      pad = Math.min(rw, rh) * PRINT_PAD,
      uc = (u0 + u1) / 2,
      vc = (v0 + v1) / 2;
    const off = Math.hypot(mx / w - 0.5, my / h - 0.5) / Math.SQRT1_2;
    out.push({
      cells: cells.map(c => [((c % gw) + 0.5) * cs, ((c - (c % gw)) / gw + 0.5) * cs]),
      cx: uc * ca - vc * sa + 0.5,
      cy: uc * sa + vc * ca + 0.5,
      w: rw + 2 * pad,
      h: rh + 2 * pad,
      angle: lean,
      score: cells.length * Math.pow(Math.max(0, 1 - off), 1.5),
    });
  }
  return out.sort((p, q) => q.score - p.score);
}
/** Where the box should start. The paper, when it was found: its edges are the receipt's own. But paper that runs off
    the photo's edge and cuts a block of print in two is a patch of light on the receipt, not the receipt (on the
    owner's photo under a hard shadow it was the lit third), and then the box goes round that block. So is paper that
    runs off the edge and is far larger than the print it holds: that is the table. With no paper found, as on a pale table, it goes
    round the likeliest block of print, which only says where the words are, so the box guesses the margin.
    @param {Grey} small the photo about CROP_SMALL on its long side @param {Grey} mid the same photo about CROP_MID
    @returns {Found|null} in the small picture's pixels */
export function findStart(small, mid) {
  const paper = findReceipt(small, mid);
  const blocks = printBlocks(mid);
  if (!blocks.length) return paper;
  const k = mid.w / small.w;
  /** @param {{cx: number, cy: number, w: number, h: number, angle: number}} b */
  const round = b => ({ cx: b.cx / k, cy: b.cy / k, w: b.w / k, h: b.h / k, angle: b.angle });
  if (paper) {
    const a = (paper.angle * Math.PI) / 180,
      ca = Math.cos(a),
      sa = Math.sin(a);
    /** @param {number[]} c a point of the finer picture */
    const inside = function (c) {
      const x = c[0] / k - paper.cx,
        y = c[1] / k - paper.cy;
      return Math.abs(x * ca + y * sa) <= paper.w / 2 && Math.abs(y * ca - x * sa) <= paper.h / 2;
    };
    /* Paper with the photo all round it is a whole sheet, and stands: on a crowded counter a block of print runs on
       from the receipt into a pot's holes, and the paper is still right. Only paper that runs off the photo's edge
       may be a part of the receipt, and then the block it cuts through says so: some of it inside, and much of it not. */
    const edge = Math.max(small.w, small.h) * 0.02;
    const off = foundCorners(paper).some(p => p[0] <= edge || p[1] <= edge || p[0] >= small.w - edge || p[1] >= small.h - edge);
    const cut = off && blocks.find(function (b) {
      const n = b.cells.filter(inside).length;
      return n >= b.cells.length * PART && n < b.cells.length * WHOLE;
    });
    if (cut) return round(cut);
    /* …or it is the pale table the receipt lies on, bright all the way to the photo's edge: then it holds the receipt's
       print whole and is far larger than it (the owner's long receipt on a white table, 12 Nov) */
    const held = blocks.filter(b => b.cells.filter(inside).length >= b.cells.length * WHOLE).sort((p, q) => q.cells.length - p.cells.length)[0];
    return off && held && paper.w * paper.h > ((held.w * held.h) / (k * k)) * LOOSE ? round(held) : paper;
  }
  /* no paper to go by: the likeliest block, unless it is most of the photo, which is no better than no answer */
  const b = blocks[0];
  return b.w * b.h > mid.w * mid.h * MOST ? null : round(b);
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

/* a pixel at least this bright, of the paper around it, in any one of its colours is a mark on the paper, not print */
const MARK = 0.8;
/** The picture made ready for the reader: grey, with the light evened and coloured marks gone.
    Light: each pixel becomes its share of the paper's brightness around it, so a shadow across the receipt, which is
    darker paper, comes out as white as the rest. The paper's brightness is the 90th percentile of each small cell of
    the picture, which print does not pull down, smoothed across cells.
    Colour: print is dark in every colour, while a highlighter stripe is as bright as paper in at least one. So a pixel
    that bright in its brightest colour is read by that colour, and the stripe vanishes; anything darker is read by the
    usual blend, so print in blue or purple ink stays as dark as it is.
    @param {Uint8ClampedArray|Uint8Array} src four numbers a pixel @param {number} w @param {number} h
    @returns {Uint8ClampedArray} grey, four numbers a pixel */
export function readable(src, w, h) {
  const n = w * h;
  const out = new Uint8ClampedArray(n * 4);
  if (!(w > 0 && h > 0) || src.length < n * 4) return out;
  const top = new Uint8Array(n),
    mix = new Uint8Array(n);
  for (let i = 0, p = 0; p < n; i += 4, p++) {
    top[p] = Math.max(src[i], src[i + 1], src[i + 2]);
    mix[p] = Math.round(0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]);
  }
  /* the paper's brightness, cell by cell */
  const cs = Math.max(8, Math.round(Math.max(w, h) / 60));
  const gw = Math.ceil(w / cs),
    gh = Math.ceil(h / cs);
  let grid = new Float32Array(gw * gh);
  const hist = new Uint32Array(256);
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) {
      hist.fill(0);
      let count = 0;
      for (let y = gy * cs; y < Math.min(h, (gy + 1) * cs); y += 2)
        for (let x = gx * cs; x < Math.min(w, (gx + 1) * cs); x += 2) {
          hist[top[y * w + x]]++;
          count++;
        }
      let v = 255;
      for (let c = hist[v]; v > 0 && c < count * 0.1; ) c += hist[--v];
      grid[gy * gw + gx] = Math.max(1, v);
    }
  /* smoothed twice over the cells beside it, so the paper's brightness has no steps in it */
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(gw * gh);
    for (let gy = 0; gy < gh; gy++)
      for (let gx = 0; gx < gw; gx++) {
        let sum = 0,
          c = 0;
        for (let y = Math.max(0, gy - 2); y <= Math.min(gh - 1, gy + 2); y++)
          for (let x = Math.max(0, gx - 2); x <= Math.min(gw - 1, gx + 2); x++) {
            sum += grid[y * gw + x];
            c++;
          }
        next[gy * gw + gx] = sum / c;
      }
    grid = next;
  }
  for (let y = 0, p = 0; y < h; y++) {
    const fy = Math.min(gh - 1, Math.max(0, (y + 0.5) / cs - 0.5)),
      y0 = Math.min(Math.max(0, gh - 2), Math.floor(fy)),
      ty = gh > 1 ? fy - y0 : 0,
      y1 = Math.min(gh - 1, y0 + 1);
    for (let x = 0; x < w; x++, p++) {
      const fx = Math.min(gw - 1, Math.max(0, (x + 0.5) / cs - 0.5)),
        x0 = Math.min(Math.max(0, gw - 2), Math.floor(fx)),
        tx = gw > 1 ? fx - x0 : 0,
        x1 = Math.min(gw - 1, x0 + 1);
      const paper = (grid[y0 * gw + x0] * (1 - tx) + grid[y0 * gw + x1] * tx) * (1 - ty) + (grid[y1 * gw + x0] * (1 - tx) + grid[y1 * gw + x1] * tx) * ty;
      const v = Math.min(255, ((top[p] >= MARK * paper ? top[p] : mix[p]) / paper) * 255);
      const o = p * 4;
      out[o] = out[o + 1] = out[o + 2] = v;
      out[o + 3] = 255;
    }
  }
  return out;
}

/* ---- a strip of the box, and whether the photo is fit to read (v141) ---- */

/** Where a place inside the box is in the photo: u across and v down the flattened picture, as parts of its width and
    height, through the same projection flatten uses, so a line found in the flattened picture can be gone back to in
    the photo itself. @param {Quad} q @param {number} u @param {number} v @returns {number[]} */
export function quadPoint(q, u, v) {
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
  const z = g * u + h * v + 1;
  return [((x1 - x0 + g * x1) * u + (x3 - x0 + h * x3) * v + x0) / z, ((y1 - y0 + g * y1) * u + (y3 - y0 + h * y3) * v + y0) / z];
}
/** The strip of the box between two heights, as a box of its own: one printed line, to be read again by itself.
    @param {Quad} q @param {number} v0 @param {number} v1 parts of the flattened picture's height @returns {Quad} */
export function quadBand(q, v0, v1) {
  const a = Math.max(0, Math.min(v0, v1)),
    b = Math.min(1, Math.max(v0, v1));
  return /** @type {Quad} */ ([quadPoint(q, 0, a), quadPoint(q, 1, a), quadPoint(q, 1, b), quadPoint(q, 0, b)]);
}

/* Whether a photo is fit to read is judged on small pieces of it, each brought to the size it would have in a photo
   1650 across its longer side: the size the numbers below were measured at, and near the size the reader works at. A
   thumbnail would hide blur. In a piece with print on it, three things are measured against the paper's own
   brightness there:
   - how far the print stands from the paper (ink);
   - how sharply it does: the steepest steps between neighbouring pixels, as a part of that distance (crisp). Fading
     shrinks both alike and leaves it be; blur spreads each step over more pixels and brings it down;
   - and the paper's brightness itself, which the pieces are compared by: a shadow leaves some far darker than the rest.
   The first try at crisp, how much of what is off the paper is fully dark, did not move with blur at all, because it
   was measured against the piece's own darkest print, which blur lightens too. */
const OFF = 0.2; /* this far from the paper toward the darkest print, and a pixel is no longer paper */
const PRINT_RANGE = 8; /* paper and print at least this far apart, */
const PRINT_INK = 0.08; /* …and this much of the paper's brightness, or there is no print in the piece */
const PRINT_LEAST = 0.02; /* of the piece off the paper: less is a speck */
const PRINT_MOST = 0.45; /* more is a dark thing, not print */
const STEEP = 0.99; /* the steps this many of the others are gentler than */
const PIECES_LEAST = 4; /* pieces with print in the box, under which nothing is said */
const BEST = 0.75; /* blur is judged by the box's better pieces: a crease or a blank patch is not blur */
/* Measured on five of the owner's receipts, blurred, shadowed and faded by known amounts, beside how many of their 102
   lines the reader then got right (v141; 56 as they are):
   - crisp was 0.74 to 0.84 as they are; 0.28 to 0.34 blurred enough to lose a fifth of the lines; 0.14 to 0.16 blurred
     enough to lose nearly all of them;
   - the darkest tenth of the pieces was 0.68 to 0.91 as bright as the brightest as they are, and 0.39 to 0.52 with a
     shadow that halved the light across a corner, which lost a third of the lines;
   - fading is measured (ink) and not warned of: with the print's contrast cut to a fifth the reader still got 54. */
const BLUR_BELOW = 0.3;
const SHADE_BELOW = 0.55;
/** One piece of the photo. @param {Uint8Array|Uint8ClampedArray} Y its brightness, a number a pixel @param {number} w
    @param {number} h @returns {{text: boolean, paper: number, ink: number, crisp: number}} */
export function patchLook(Y, w, h) {
  const n = w * h,
    hist = new Uint32Array(256),
    steps = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[Y[i]]++;
  for (let y = 0; y < h - 1; y++)
    for (let x = 0, i = y * w; x < w - 1; x++, i++) {
      const a = Math.abs(Y[i + 1] - Y[i]),
        b = Math.abs(Y[i + w] - Y[i]);
      steps[a > b ? a : b]++;
    }
  /** @param {Uint32Array} of @param {number} share @param {number} all */
  const at = function (of, share, all) {
    let seen = 0;
    for (let v = 0; v < 256; v++) {
      seen += of[v];
      if (seen >= share * all) return v;
    }
    return 255;
  };
  const paper = at(hist, 0.9, n),
    range = paper - at(hist, 0.01, n),
    ink = paper ? range / paper : 0;
  let off = 0;
  for (let v = 0; v < paper - OFF * range; v++) off += hist[v];
  const share = n ? off / n : 0;
  return {
    text: range >= PRINT_RANGE && ink >= PRINT_INK && share >= PRINT_LEAST && share <= PRINT_MOST,
    paper: paper,
    ink: ink,
    crisp: range > 0 ? Math.min(1, at(steps, STEEP, (w - 1) * (h - 1)) / range) : 0,
  };
}
/** What is wrong with the part of a photo that is to be read, if anything, from its pieces (patchLook): "blur",
    "shadow", or "" for nothing, or too little print to tell.
    @param {{text: boolean, paper: number, ink: number, crisp: number}[]} looks the pieces inside the box
    @returns {{why: string, n: number, crisp: number, ink: number, even: number}} */
export function photoCheck(looks) {
  const t = (looks || []).filter(l => l && l.text);
  if (t.length < PIECES_LEAST) return { why: "", n: t.length, crisp: 1, ink: 1, even: 1 };
  /** @param {number[]} a @param {number} share */
  const at = (a, share) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(share * a.length))];
  const crisp = at(t.map(l => l.crisp), BEST),
    ink = at(t.map(l => l.ink), BEST),
    papers = t.map(l => l.paper),
    even = at(papers, 0.9) ? at(papers, 0.1) / at(papers, 0.9) : 1;
  return { why: crisp < BLUR_BELOW ? "blur" : even < SHADE_BELOW ? "shadow" : "", n: t.length, crisp: crisp, ink: ink, even: even };
}

if (typeof window !== "undefined") Object.assign(window, { CROP_SMALL, CROP_MID, findReceipt, findStart, foundCorners, quadOk, quadSize, flatten, readable, quadPoint, quadBand, patchLook, photoCheck });
