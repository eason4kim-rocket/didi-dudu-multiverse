/**
 * 迪迪和独独的多元宇宙: universe presets.
 *
 * A universe is a visual theme AND a physics profile — switching worlds
 * changes gravity, ground friction and how hard the drive grips, so each
 * universe genuinely handles differently (digital-twin style, not a skin).
 */

export type SkyKind = "dusk" | "galaxy" | "snow";

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
    fog: 0x6d3a1c,
    fogNear: 16,
    fogFar: 50,
    hemi: [0x9fb2d8, 0x7a4a2c, 0.7],
    sun: [0xffd9a4, 1.05],
    fill: [0xa8c4ff, 0.45],
    sandBase: "#cfa76b",
    sandFleck: "120,80,48",
    groundTint: 0xe4ad66,
    duneColor: 0xb06e3c,
    rockColor: 0x7c4526,
    // Real Mars surface gravity: jumps and dune launches float longer.
    gravity: -3.71,
    ballFriction: 1.05,
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
    hemi: [0xeaf4ff, 0x9fb6c8, 1.0],
    sun: [0xfff4e0, 1.1],
    fill: [0xcfe4ff, 0.5],
    sandBase: "#e6eef5",
    sandFleck: "150,170,192",
    groundTint: 0xeef4f8,
    duneColor: 0xdde9f2,
    rockColor: 0x7a8794,
    // Light gravity + icy ground + weak grip = drifty snow-moon driving.
    gravity: -5.0,
    ballFriction: 0.12,
    gripScale: 0.18,
  },
];

/** Runtime knob read by the drive physics each frame. */
export const runtimeGrip = { scale: 1 };
