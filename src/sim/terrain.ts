/**
 * Shared terrain layout: the renderer and the physics world both read this,
 * so what you see is exactly what you collide with.
 *
 * Dunes are real spheres buried in the ground (dome caps above the surface).
 * A sphere is a shape cannon-es collides with exactly, so climbing them is
 * genuine physics — no visual-only scenery near the play area.
 */

export interface Dome {
  x: number;
  z: number;
  /** Sphere radius. */
  r: number;
  /** How deep the sphere centre sits below ground; cap height = r - sink. */
  sink: number;
}

export const DOMES: Dome[] = [
  // Near, gentle and climbable.
  { x: 9, z: -7, r: 6, sink: 5.1 },
  { x: -8, z: 9, r: 7, sink: 6.1 },
  // Mid-distance ridges.
  { x: 16, z: 14, r: 10, sink: 8.6 },
  { x: -18, z: -13, r: 12, sink: 10.4 },
  // Horizon scenery (still solid, just far away).
  { x: 30, z: -6, r: 18, sink: 14.6 },
  { x: -6, z: -32, r: 20, sink: 16 },
  { x: -30, z: 18, r: 16, sink: 13 },
];

export interface Rock {
  x: number;
  y: number;
  z: number;
  /** Visual dodecahedron size; physics uses a slightly smaller sphere. */
  s: number;
}

export const ROCKS: Rock[] = [
  { x: 3.2, y: 0.18, z: -2.4, s: 0.45 },
  { x: -4.1, y: 0.14, z: 1.8, s: 0.32 },
  { x: 6.4, y: 0.22, z: 3.1, s: 0.55 },
  { x: -2.6, y: 0.12, z: -5.2, s: 0.28 },
  { x: 1.4, y: 0.1, z: 6.8, s: 0.22 },
];
