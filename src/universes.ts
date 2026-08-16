/**
 * 迪迪和独独的多元宇宙: universe presets.
 *
 * A universe is a visual theme AND a physics profile — switching worlds
 * changes gravity, ground friction and how hard the drive grips, so each
 * universe genuinely handles differently (digital-twin style, not a skin).
 *
 * Phase-1 realism: grounds carry a procedural bump map (real relief under the
 * light), skies and lighting are tuned per body — Mars a rusty basaltic
 * regolith under a clear Milky-Way night, the Moon grey regolith under a harsh
 * airless sun with near-black shadows, the ice-field a bright low-friction sheet.
 */

export type SkyKind = "dusk" | "galaxy" | "snow" | "moon";

export interface Universe {
  id: string;
  name: string;
  /** English label for the universe button when language = en. */
  nameEn: string;
  sky: SkyKind;
  background: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  /** HemisphereLight: sky color, ground color, intensity. */
  hemi: [number, number, number];
  /** DirectionalLight sun: color, intensity. */
  sun: [number, number];
  /** DirectionalLight fill: color, intensity. */
  fill: [number, number];
  /** Ground canvas-texture base color. */
  sandBase: string;
  /** Ground texture fleck/streak color as "r,g,b". */
  sandFleck: string;
  /** Ground material tint. */
  groundTint: number;
  duneColor: number;
  rockColor: number;
  /** Procedural bump-map depth on the ground: how much relief the light reveals. */
  bumpScale: number;
  /** Cratered regolith bump (Moon) vs wind-blown grain (deserts/ice). */
  cratered: boolean;
  /** m/s^2, negative = down. */
  gravity: number;
  /** Ball-vs-ground contact friction. */
  ballFriction: number;
  /** Scales BB-8's lateral grip / roll alignment (ice = drifty). */
  gripScale: number;
}

export const UNIVERSES: Universe[] = [
  {
    id: "dusk",
    name: "黄沙黄昏",
    nameEn: "Dusk Dunes",
    sky: "dusk",
    background: 0xe9c290,
    fog: 0xe9c290,
    fogNear: 14,
    fogFar: 46,
    hemi: [0xf4ecda, 0x8a6a42, 0.95],
    sun: [0xffe6bd, 1.15],
    fill: [0xb8d4ff, 0.35],
    sandBase: "#cbab7d",
    sandFleck: "140,106,62",
    groundTint: 0xc4a06a,
    duneColor: 0xd9b489,
    rockColor: 0x8d6a3e,
    bumpScale: 0.018,
    cratered: false,
    gravity: -9.82,
    ballFriction: 1.05,
    gripScale: 1,
  },
  {
    id: "mars",
    name: "火星银河夜",
    nameEn: "Mars Galaxy Night",
    sky: "galaxy",
    background: 0x05030a,
    fog: 0x2a1208,
    fogNear: 20,
    fogFar: 58,
    // Clear thin-atmosphere night: faint warm skyglow, cold starlight fill.
    hemi: [0x6b5566, 0x3a241a, 0.55],
    sun: [0xffcaa0, 0.85],
    fill: [0x8aa0d8, 0.35],
    // Real Mars regolith: oxidised basalt — rusty brown-red, not sandy tan.
    sandBase: "#8f4f36",
    sandFleck: "58,30,20",
    groundTint: 0xa85c3a,
    duneColor: 0x8a4a30,
    rockColor: 0x5f3320,
    bumpScale: 0.026,
    cratered: false,
    // Real Mars surface gravity: jumps and dune launches float longer.
    gravity: -3.71,
    ballFriction: 1.0,
    gripScale: 1,
  },
  {
    id: "snow",
    name: "低重力冰雪",
    nameEn: "Icy Low-G",
    sky: "snow",
    background: 0xdcecf7,
    fog: 0xdcecf7,
    fogNear: 15,
    fogFar: 48,
    hemi: [0xeaf4ff, 0x9fb6c8, 1.05],
    sun: [0xfff4e0, 1.15],
    fill: [0xcfe4ff, 0.55],
    sandBase: "#e7eef4",
    sandFleck: "150,172,196",
    groundTint: 0xeef5fb,
    duneColor: 0xdde9f2,
    rockColor: 0x7a8794,
    bumpScale: 0.02,
    cratered: false,
    // Light gravity + icy ground + weak grip = drifty snow-moon driving.
    gravity: -5.0,
    ballFriction: 0.12,
    gripScale: 0.18,
  },
  {
    id: "moon",
    name: "月球",
    nameEn: "The Moon",
    sky: "moon",
    background: 0x04050a,
    fog: 0x04050a,
    // Airless: no atmospheric haze — a hard, sharp horizon.
    fogNear: 70,
    fogFar: 260,
    // Airless lighting: strong sun, almost no fill, near-black shadows.
    hemi: [0x2b3040, 0x2a2a2e, 0.22],
    sun: [0xfff6ea, 1.75],
    fill: [0x3a4664, 0.05],
    // Lunar regolith: mid grey, dark flecks; reads bright under the harsh sun.
    sandBase: "#9a9aa0",
    sandFleck: "64,64,72",
    groundTint: 0xbcbcc2,
    duneColor: 0xa6a6ac,
    rockColor: 0x74747c,
    bumpScale: 0.05,
    cratered: true,
    gravity: -1.62,
    ballFriction: 0.92,
    gripScale: 1,
  },
];

/** Runtime knob read by the drive physics each frame. */
export const runtimeGrip = { scale: 1 };
