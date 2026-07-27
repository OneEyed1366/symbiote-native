/*
  Build-time geometry for the hero symbiote.

  The creature used to be a RUNTIME metaball: an SVG `feGaussianBlur` +
  `feColorMatrix` goo filter over ~21 shapes whose `d` attributes were rewritten
  from `requestAnimationFrame`. Every one of those rewrites forces the engine to
  re-run the filter over its whole region — cheap on Blink/Gecko, brutally
  expensive on WebKit, which re-rasterises it on the CPU (webkit bug 283156).
  That is the entire reason the hero animated fine in desktop Chrome/Firefox and
  was a frozen slideshow on an iPhone.

  So the goo is resolved HERE instead, once, at build time: the same metaball
  field is contoured with marching squares into plain `<path>` outlines. The
  page then ships ZERO SVG filters on anything that moves and ZERO animation
  JavaScript — motion is CSS `transform` keyframes over a handful of static
  paths, which behaves identically on every engine.

  Everything below is emitted in ROOT viewBox coordinates (the old markup had
  the body group carry `translate(32,6) scale(1.18)`). Baking that transform in
  is what lets every animated limb share one `transform-origin`, since CSS
  `transform-origin` on an SVG child resolves against the viewBox, not against
  an ancestor group's transform.
*/

export interface ILimb {
  /** Static outline, already in root viewBox units. */
  d: string;
  /** Pivot the limb swings around — the root end, buried inside the mass. */
  ox: number;
  oy: number;
  /** CSS animation timing, pre-varied so no two limbs move in step. */
  dur: string;
  delay: string;
  /** Rotation sweep endpoints, in degrees. */
  rotA: string;
  rotB: string;
  /** Radial reach endpoints — the limb extends and retracts. */
  scaleA: string;
  scaleB: string;
}

export interface ISymbioteShape {
  /** Fused body outlines (usually one loop, but the contour walk is generic). */
  mass: string[];
  tendrils: ILimb[];
  grips: ILimb[];
  /** The body gradient's userSpaceOnUse stops, moved into root coordinates. */
  gradient: { x1: number; y1: number; x2: number; y2: number };
  /** Body centre — the pivot every tendril swings around. */
  centre: { x: number; y: number };
}

/* The creature is authored in its own 100,120-centred space and parked behind
   the device by this transform. `place()` bakes it into root coordinates. */
const OX = 32;
const OY = 6;
const SCALE = 1.18;

const place = (x: number, y: number): [number, number] => [OX + SCALE * x, OY + SCALE * y];

const CX = OX + SCALE * 100;
const CY = OY + SCALE * 120;

/* The core mass, as the old markup's `<circle class="core">` lumps. */
const LUMPS: Array<[number, number, number]> = (
  [
    [100, 118, 50],
    [84, 104, 30],
    [120, 110, 32],
    [98, 146, 34],
    // head cap — bulges up over the device's top edge so the face has a body
    [92, 46, 33],
    [110, 42, 23],
  ] as Array<[number, number, number]>
).map(([x, y, r]) => {
  const [px, py] = place(x, y);
  return [px, py, r * SCALE];
});

// ── metaball field ───────────────────────────────────────────────────────────

/*
  A lone lump's iso-1 contour is exactly its own circle, and neighbours bulge
  into each other — the same fusing the runtime blur+threshold filter used to
  do, minus the per-frame cost.

  The exponent is what tunes "goo". Plain inverse-square (`(r/d)²`) has support
  so wide that six lumps still sum above the threshold a hundred units away, and
  the contour never closes inside any sane sampling window; the fourth power
  decays fast enough to stay local while still webbing neighbours together.
*/
function field(x: number, y: number): number {
  let sum = 0;
  for (const [cx, cy, r] of LUMPS) {
    const dx = x - cx;
    const dy = y - cy;
    const ratio = (r * r) / (dx * dx + dy * dy + 1e-6);
    sum += ratio * ratio;
  }
  return sum;
}

const ISO = 1;

type Point = [number, number];

/* Which cell edges the contour crosses, per corner-inside bitmask.
   Bits: 1 = top-left, 2 = top-right, 4 = bottom-right, 8 = bottom-left.
   Edges: 0 = top, 1 = right, 2 = bottom, 3 = left. */
const CASES: number[][][] = [
  [], // 0
  [[3, 0]], // 1
  [[0, 1]], // 2
  [[3, 1]], // 3
  [[1, 2]], // 4
  [
    [3, 0],
    [1, 2],
  ], // 5 — saddle
  [[0, 2]], // 6
  [[3, 2]], // 7
  [[2, 3]], // 8
  [[2, 0]], // 9
  [
    [0, 1],
    [2, 3],
  ], // 10 — saddle
  [[2, 1]], // 11
  [[1, 3]], // 12
  [[1, 0]], // 13
  [[0, 3]], // 14
  [], // 15
];

const key = (p: Point) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;

/* Where along an edge the field crosses ISO. */
function crossing(ax: number, ay: number, av: number, bx: number, by: number, bv: number): Point {
  const t = (ISO - av) / (bv - av);
  return [ax + t * (bx - ax), ay + t * (by - ay)];
}

/*
  Marching squares over the field, stitched into closed loops.

  Sampling the field is the expensive half, so the grid is evaluated row by row
  and the previous row is reused rather than probing each corner four times.
*/
function contours(x0: number, y0: number, x1: number, y1: number, step: number): Point[][] {
  const cols = Math.ceil((x1 - x0) / step) + 1;
  const rows = Math.ceil((y1 - y0) / step) + 1;

  const grid: number[][] = [];
  for (let j = 0; j < rows; j++) {
    const row: number[] = [];
    for (let i = 0; i < cols; i++) row.push(field(x0 + i * step, y0 + j * step));
    grid.push(row);
  }

  /* Undirected adjacency: every contour point links to its up-to-two
     neighbours, which is all a closed-loop walk needs. */
  const points = new Map<string, Point>();
  const links = new Map<string, string[]>();

  const link = (from: string, to: string) => {
    const existing = links.get(from);
    if (existing) existing.push(to);
    else links.set(from, [to]);
  };

  const connect = (a: Point, b: Point) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === kb) return;
    points.set(ka, a);
    points.set(kb, b);
    link(ka, kb);
    link(kb, ka);
  };

  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const ax = x0 + i * step;
      const ay = y0 + j * step;
      const bx = ax + step;
      const by = ay + step;

      const va = grid[j][i];
      const vb = grid[j][i + 1];
      const vc = grid[j + 1][i + 1];
      const vd = grid[j + 1][i];

      const mask =
        (va >= ISO ? 1 : 0) | (vb >= ISO ? 2 : 0) | (vc >= ISO ? 4 : 0) | (vd >= ISO ? 8 : 0);
      const segments = CASES[mask];
      if (segments.length === 0) continue;

      const edge: Array<Point | null> = [null, null, null, null];
      if (segments.some(s => s.includes(0))) edge[0] = crossing(ax, ay, va, bx, ay, vb);
      if (segments.some(s => s.includes(1))) edge[1] = crossing(bx, ay, vb, bx, by, vc);
      if (segments.some(s => s.includes(2))) edge[2] = crossing(bx, by, vc, ax, by, vd);
      if (segments.some(s => s.includes(3))) edge[3] = crossing(ax, by, vd, ax, ay, va);

      for (const [from, to] of segments) {
        const p = edge[from];
        const q = edge[to];
        if (p && q) connect(p, q);
      }
    }
  }

  const seen = new Set<string>();
  const loops: Point[][] = [];

  for (const start of points.keys()) {
    if (seen.has(start)) continue;
    const loop: Point[] = [];
    let current: string | undefined = start;
    let previous = '';

    while (current && !seen.has(current)) {
      seen.add(current);
      loop.push(points.get(current)!);
      const next: string | undefined = (links.get(current) ?? []).find(
        k => k !== previous && !seen.has(k),
      );
      previous = current;
      current = next;
    }

    // a loop needs enough points to survive smoothing; stray 2-point stubs don't
    if (loop.length > 8) loops.push(loop);
  }

  return loops;
}

// ── polygon → smooth path ────────────────────────────────────────────────────

/* Chaikin corner-cutting: turns the marching-squares staircase into a curve
   without needing a higher-resolution (and much slower) grid. */
function chaikin(pts: Point[], passes: number): Point[] {
  let out = pts;
  for (let n = 0; n < passes; n++) {
    const next: Point[] = [];
    for (let i = 0; i < out.length; i++) {
      const [ax, ay] = out[i];
      const [bx, by] = out[(i + 1) % out.length];
      next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25]);
      next.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    out = next;
  }
  return out;
}

/* Thin the outline out so the emitted `d` stays a few hundred bytes rather than
   a few dozen kilobytes — the Catmull-Rom pass below restores the curvature. */
function decimate(pts: Point[], minDistance: number): Point[] {
  const out: Point[] = [pts[0]];
  for (const p of pts.slice(1)) {
    const last = out[out.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= minDistance) out.push(p);
  }
  // drop a final point that sits on top of the first, which would kink the close
  if (out.length > 2) {
    const first = out[0];
    const last = out[out.length - 1];
    if (Math.hypot(last[0] - first[0], last[1] - first[1]) < minDistance * 0.5) out.pop();
  }
  return out;
}

const round = (n: number) => Number(n.toFixed(1));

/* Closed Catmull-Rom spline emitted as cubic beziers. */
function toPath(pts: Point[]): string {
  const n = pts.length;
  const at = (i: number) => pts[((i % n) + n) % n];
  let d = `M${round(pts[0][0])},${round(pts[0][1])}`;

  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d +=
      `C${round(c1[0])},${round(c1[1])} ` +
      `${round(c2[0])},${round(c2[1])} ` +
      `${round(p2[0])},${round(p2[1])}`;
  }

  return `${d}Z`;
}

// ── limbs ────────────────────────────────────────────────────────────────────

/* Seeded PRNG: the creature must look the same in every build, and a landing
   page that reshuffles its own silhouette between deploys is a diff nightmare. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/*
  One tapering limb, built as a ribbon offset around a curved spine.

  The obvious cheap shape — two quadratics sharing one control point — was what
  the old runtime version used, and it only ever looked like a limb because the
  goo filter's blur-and-threshold pass fattened it back up. Drawn unfiltered it
  collapses into a thin spike. Offsetting an explicit width profile along the
  spine gives a shape that reads as a tentacle on its own, with no filter to
  rescue it.
*/
const SPINE_SAMPLES = 12;

function limbPath(
  bx: number,
  by: number,
  mx: number,
  my: number,
  tx: number,
  ty: number,
  halfWidth: number,
): string {
  const spine: Point[] = [];
  for (let i = 0; i < SPINE_SAMPLES; i++) {
    const s = i / (SPINE_SAMPLES - 1);
    const inv = 1 - s;
    spine.push([
      inv * inv * bx + 2 * inv * s * mx + s * s * tx,
      inv * inv * by + 2 * inv * s * my + s * s * ty,
    ]);
  }

  const left: Point[] = [];
  const right: Point[] = [];

  for (let i = 0; i < SPINE_SAMPLES; i++) {
    const s = i / (SPINE_SAMPLES - 1);

    /* Widest at the root and thinning the whole way out — a limb that keeps its
       width past halfway reads as a leaf, not a tentacle. */
    const w = halfWidth * Math.pow(1 - s, 0.62);

    const prev = spine[Math.max(0, i - 1)];
    const next = spine[Math.min(SPINE_SAMPLES - 1, i + 1)];
    const tanX = next[0] - prev[0];
    const tanY = next[1] - prev[1];
    const len = Math.hypot(tanX, tanY) || 1;
    const nx = -tanY / len;
    const ny = tanX / len;

    left.push([spine[i][0] + nx * w, spine[i][1] + ny * w]);
    right.push([spine[i][0] - nx * w, spine[i][1] - ny * w]);
  }

  // the two flanks plus the shared tip, walked as one closed outline
  return toPath([...left, ...right.slice(0, -1).reverse()]);
}

const TENDRIL_COUNT = 13;

function buildTendrils(): ILimb[] {
  const rand = mulberry32(0x5b107e);
  const limbs: ILimb[] = [];

  for (let i = 0; i < TENDRIL_COUNT; i++) {
    const between = (a: number, b: number) => a + rand() * (b - a);

    // long primaries interleaved with short secondaries → a dense, writhing crown
    const primary = i % 2 === 0;
    const angle = (i / TENDRIL_COUNT) * Math.PI * 2 + between(-0.26, 0.26);
    /* Rooted well inside the mass (whose main lump reaches r≈59 from the same
       centre) so the ribbon's blunt base is never visible. */
    const root = between(16, 26) * SCALE;
    const length = (primary ? between(112, 156) : between(64, 98)) * SCALE;
    const width = (primary ? between(30, 44) : between(20, 30)) * SCALE;
    const curl = between(-0.3, 0.3);
    const drift = between(-0.3, 0.3);

    const bx = CX + Math.cos(angle) * root;
    const by = CY + Math.sin(angle) * root;
    const tx = CX + Math.cos(angle + drift) * length;
    const ty = CY + Math.sin(angle + drift) * length;

    // a control point off the limb's own axis is what makes it curl
    const bend = length * curl;
    const midAngle = angle + drift / 2;
    const mx = (bx + tx) / 2 + Math.cos(midAngle + Math.PI / 2) * bend;
    const my = (by + ty) / 2 + Math.sin(midAngle + Math.PI / 2) * bend;

    /* The whole limb swings around the body centre and reaches in and out along
       its own axis. Two keyframes of `transform` is the entire animation — no
       geometry is ever touched again after build. */
    const sweep = between(2.4, 5.6);
    const reach = between(0.03, 0.075);

    limbs.push({
      d: limbPath(bx, by, mx, my, tx, ty, width / 2),
      ox: CX,
      oy: CY,
      dur: `${between(3.6, 7.4).toFixed(2)}s`,
      delay: `-${between(0, 6).toFixed(2)}s`,
      rotA: `${(-sweep).toFixed(2)}deg`,
      rotB: `${sweep.toFixed(2)}deg`,
      scaleA: (1 - reach).toFixed(3),
      scaleB: (1 + reach).toFixed(3),
    });
  }

  return limbs;
}

/*
  Grip limbs: rooted on the body's visible flanks and curling over the device's
  front corners, so the creature reads as holding the phone rather than sitting
  behind it. Authored directly in root coordinates — they were never part of the
  body group's transform.
*/
function buildGrips(): ILimb[] {
  const specs = [
    /* Kept deliberately narrow: these cross in FRONT of the screen, so a fat
       claw would sit on top of the device's own UI, which is the one thing on
       the page that has to stay legible. */
    // deliberately not mirror images — a perfectly symmetric pair reads as a
    // handle bolted onto the device rather than as something alive holding it
    { bx: 98, by: 176, tx: 130, ty: 94, width: 22, dur: '5.20s', delay: '-1.10s', sweep: 2.6 },
    { bx: 202, by: 172, tx: 170, ty: 104, width: 24, dur: '6.10s', delay: '-3.40s', sweep: 2.3 },
  ];

  return specs.map(g => {
    // bow the limb outward so it reads as a finger curling over the rim rather
    // than a straight bar laid across the screen
    const mx = g.bx + (g.bx - g.tx) * 0.34;
    const my = (g.by + g.ty) / 2 - 14;

    return {
      d: limbPath(g.bx, g.by, mx, my, g.tx, g.ty, g.width / 2),
      ox: g.bx,
      oy: g.by,
      dur: g.dur,
      delay: g.delay,
      rotA: `${(-g.sweep).toFixed(2)}deg`,
      rotB: `${g.sweep.toFixed(2)}deg`,
      scaleA: '0.97',
      scaleB: '1.04',
    };
  });
}

// ── public surface ───────────────────────────────────────────────────────────

export function buildSymbioteShape(): ISymbioteShape {
  /* The window is deliberately wider than the lumps' own extent: a contour that
     runs into the sampling edge comes back as an open, broken loop. */
  const loops = contours(40, -30, 265, 272, 1);

  const mass = loops.map(loop => toPath(decimate(chaikin(loop, 2), 4.6))).filter(d => d.length > 0);

  const [gx1, gy1] = place(44, 44);
  const [gx2, gy2] = place(156, 200);

  return {
    mass,
    tendrils: buildTendrils(),
    grips: buildGrips(),
    gradient: { x1: gx1, y1: gy1, x2: gx2, y2: gy2 },
    centre: { x: CX, y: CY },
  };
}
