// Minimal $1 unistroke recognizer (Wobbrock et al.).
// Compares a drawn stroke against a template; returns score 0..1.
// Both client and edge function use the same algorithm.

export type Pt = [number, number];

const N = 64;       // resample point count
const SQUARE = 1;   // template bounding box edge after scaling
const HALF_DIAGONAL = 0.5 * Math.SQRT2;
const ANGLE_RANGE = (45 * Math.PI) / 180;
const ANGLE_PRECISION = (2 * Math.PI) / 180;
const PHI = 0.5 * (-1 + Math.sqrt(5));

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function pathLength(pts: Pt[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += dist(pts[i - 1], pts[i]);
  return d;
}

function resample(points: Pt[], n: number): Pt[] {
  if (points.length < 2) return points.slice();
  const I = pathLength(points) / (n - 1);
  let D = 0;
  const out: Pt[] = [points[0]];
  const pts = points.slice();
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (D + d >= I) {
      const qx = pts[i - 1][0] + ((I - D) / d) * (pts[i][0] - pts[i - 1][0]);
      const qy = pts[i - 1][1] + ((I - D) / d) * (pts[i][1] - pts[i - 1][1]);
      const q: Pt = [qx, qy];
      out.push(q);
      pts.splice(i, 0, q);
      D = 0;
    } else D += d;
  }
  while (out.length < n) out.push(pts[pts.length - 1]);
  return out;
}

function centroid(pts: Pt[]): Pt {
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [x / pts.length, y / pts.length];
}

function indicativeAngle(pts: Pt[]): number {
  const c = centroid(pts);
  return Math.atan2(c[1] - pts[0][1], c[0] - pts[0][0]);
}

function rotateBy(pts: Pt[], radians: number): Pt[] {
  const c = centroid(pts);
  const cos = Math.cos(radians), sin = Math.sin(radians);
  return pts.map(p => [
    (p[0] - c[0]) * cos - (p[1] - c[1]) * sin + c[0],
    (p[0] - c[0]) * sin + (p[1] - c[1]) * cos + c[1],
  ] as Pt);
}

function scaleTo(pts: Pt[], size: number): Pt[] {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
  }
  const w = maxX - minX || 1, h = maxY - minY || 1;
  return pts.map(p => [(p[0] - minX) * (size / w), (p[1] - minY) * (size / h)] as Pt);
}

function translateTo(pts: Pt[], target: Pt): Pt[] {
  const c = centroid(pts);
  return pts.map(p => [p[0] + target[0] - c[0], p[1] + target[1] - c[1]] as Pt);
}

function pathDistance(a: Pt[], b: Pt[]): number {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) d += dist(a[i], b[i]);
  return d / a.length;
}

function distanceAtAngle(pts: Pt[], tpl: Pt[], radians: number): number {
  return pathDistance(rotateBy(pts, radians), tpl);
}

function distanceAtBestAngle(pts: Pt[], tpl: Pt[]): number {
  let a = -ANGLE_RANGE, b = ANGLE_RANGE;
  let x1 = PHI * a + (1 - PHI) * b;
  let f1 = distanceAtAngle(pts, tpl, x1);
  let x2 = (1 - PHI) * a + PHI * b;
  let f2 = distanceAtAngle(pts, tpl, x2);
  while (Math.abs(b - a) > ANGLE_PRECISION) {
    if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = PHI * a + (1 - PHI) * b; f1 = distanceAtAngle(pts, tpl, x1); }
    else { a = x1; x1 = x2; f1 = f2; x2 = (1 - PHI) * a + PHI * b; f2 = distanceAtAngle(pts, tpl, x2); }
  }
  return Math.min(f1, f2);
}

export function preprocess(raw: Pt[]): Pt[] {
  let pts = resample(raw, N);
  pts = rotateBy(pts, -indicativeAngle(pts));
  pts = scaleTo(pts, SQUARE);
  pts = translateTo(pts, [0, 0]);
  return pts;
}

/** Returns score 0..1 (higher = better match). */
export function scoreAgainstTemplate(drawn: Pt[], template: Pt[]): number {
  if (drawn.length < 4 || template.length < 2) return 0;
  const d = preprocess(drawn);
  const t = preprocess(template);
  const dist = distanceAtBestAngle(d, t);
  return Math.max(0, 1 - dist / HALF_DIAGONAL);
}
