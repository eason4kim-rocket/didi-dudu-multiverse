/**
 * 阶段2 真实地形. Global DEM is sub-pixel at our ~44m arena scale, so the terrain
 * is authored procedurally *at this scale* instead — real landform morphology,
 * not a stretched planet map. One height function feeds BOTH the cannon
 * Heightfield collider and the render mesh, so what you see is what you roll over.
 *
 * Morphology per world: Moon = impact craters (bowl floor + raised rim), Mars =
 * wind-carved dune ridges + a few small craters, ice = gentle drifts, dusk =
 * soft dunes. A flat disc protects the spawn; relief tapers to a flat horizon
 * so the ground still meets the sky cleanly.
 */

export const HF_SIZE = 96; // world units, square centred on origin (±48)
export const HF_N = 64; // grid segments per side
export const HF_ELEM = HF_SIZE / HF_N;

const FLAT_R = 7; // spawn/start disc kept perfectly flat
const TAPER_R0 = 34; // relief fades out between here...
const TAPER_R1 = 44; // ...and here, to a flat horizon

interface Crater {
  x: number;
  z: number;
  r: number;
  depth: number;
}

const CRATERS: Record<string, Crater[]> = {};

/** Tiny deterministic PRNG so each world's craters are stable across rebuilds. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function cratersFor(id: string, count: number, seed: number): Crater[] {
  const cached = CRATERS[id];
  if (cached) {
    return cached;
  }
  const rnd = lcg(seed);
  const list: Crater[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = rnd() * Math.PI * 2;
    const rad = FLAT_R + 2 + rnd() * (TAPER_R0 - FLAT_R - 4);
    list.push({
      x: Math.cos(a) * rad,
      z: Math.sin(a) * rad,
      r: 1.6 + rnd() * 3.4,
      depth: 0.18 + rnd() * 0.34,
    });
  }
  CRATERS[id] = list;
  return list;
}

/** Cheap deterministic value-ish noise from summed hashed sines — no deps. */
function noise2(x: number, z: number): number {
  return (
    Math.sin(x * 0.9 + 1.7) * Math.cos(z * 0.8 - 0.4) * 0.5 +
    Math.sin(x * 0.37 - z * 0.29) * 0.3 +
    Math.sin((x + z) * 1.9) * 0.12
  );
}

/** Crater cross-section: t=dist/r in 0..1. Sunken floor, raised rim, 0 at edge. */
function craterProfile(t: number): number {
  if (t >= 1) {
    return 0;
  }
  const floor = -(1 - Math.min(t / 0.78, 1) ** 2); // -1 at centre → 0 by 0.78
  const rim = Math.exp(-(((t - 0.86) / 0.09) ** 2)) * 0.6; // raised rim ring
  return floor * 0.7 + rim;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Terrain height at a world (x,z) for a given universe — the single source. */
export function heightAtWorld(x: number, z: number, id: string): number {
  const r = Math.hypot(x, z);
  if (r >= TAPER_R1) {
    return 0;
  }

  let h = 0;
  if (id === "moon") {
    h += noise2(x * 0.5, z * 0.5) * 0.08;
    for (const c of cratersFor("moon", 14, 91)) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.r) {
        h += c.depth * craterProfile(d / c.r);
      }
    }
  } else if (id === "mars") {
    h += Math.sin(x * 0.5 + noise2(x * 0.2, z * 0.2) * 2) * 0.16; // dune ridges
    h += noise2(x * 0.3, z * 0.3) * 0.08;
    for (const c of cratersFor("mars", 6, 47)) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.r) {
        h += c.depth * 0.7 * craterProfile(d / c.r);
      }
    }
  } else if (id === "snow") {
    h += noise2(x * 0.28, z * 0.28) * 0.16 + noise2(x * 0.6, z * 0.55) * 0.05;
  } else {
    h += Math.sin(x * 0.32 + 0.6) * 0.12 + noise2(x * 0.25, z * 0.3) * 0.1;
  }

  const inner = smoothstep(FLAT_R, FLAT_R + 5, r); // flat spawn disc
  const outer = 1 - smoothstep(TAPER_R0, TAPER_R1, r); // flat far horizon
  return h * inner * outer;
}

/** cannon Heightfield grid: data[xi][yi] = height at that world (x,z). */
export function makeHeightfieldData(id: string): number[][] {
  const data: number[][] = [];
  for (let xi = 0; xi <= HF_N; xi += 1) {
    const wx = xi * HF_ELEM - HF_SIZE / 2;
    const col: number[] = [];
    for (let yi = 0; yi <= HF_N; yi += 1) {
      const wz = HF_SIZE / 2 - yi * HF_ELEM;
      col.push(heightAtWorld(wx, wz, id));
    }
    data.push(col);
  }
  return data;
}
