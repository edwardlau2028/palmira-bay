// PALMIRA BAY — shared helpers: seeded random, angles, distances, collisions.
// Every system in the game imports from here so the city, traffic, police and
// missions all agree on the same math.
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function rand(rng, a, b) { return a + rng() * (b - a); }
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function dist2d(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }
export function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * clamp(t, 0, 1);
}
export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
// Push a circle (x,z,r) out of an axis-aligned box collider {x,z,w,d}.
// Returns corrected {x,z} or null when there is no overlap.
export function collideCircleBox(x, z, r, b) {
  const cx = clamp(x, b.x - b.w / 2, b.x + b.w / 2);
  const cz = clamp(z, b.z - b.d / 2, b.z + b.d / 2);
  const dx = x - cx, dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return { x: cx + (dx / d) * r, z: cz + (dz / d) * r };
  }
  // Centre inside the box: push out along the smallest penetration axis.
  const px = b.w / 2 + r - Math.abs(x - b.x);
  const pz = b.d / 2 + r - Math.abs(z - b.z);
  if (px < pz) return { x: b.x + (x > b.x ? 1 : -1) * (b.w / 2 + r), z };
  return { x, z: b.z + (z > b.z ? 1 : -1) * (b.d / 2 + r) };
}
export function collideAll(x, z, r, colliders) {
  for (const b of colliders) {
    const hit = collideCircleBox(x, z, r, b);
    if (hit) { x = hit.x; z = hit.z; }
  }
  return { x, z };
}
// Heading (radians, 0 = +Z) to a forward vector.
export function forwardOf(heading) { return { x: Math.sin(heading), z: Math.cos(heading) }; }
export function formatMoney(n) { return '$' + Math.floor(n).toLocaleString('en-US'); }
export function formatClock(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
