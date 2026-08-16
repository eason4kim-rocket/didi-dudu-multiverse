import * as THREE from "three";
import { heightAtWorld } from "../sim/heightfield";

/**
 * 真身零件 — the body-parts 迪迪 pulls out of the worlds to become real. Roll
 * over one to take it; taking it drains that world's 生机 (see WorldVitality).
 *
 * 黄沙黄昏 (dusk) is home — 节拍1 takes nothing, 黄昏永远暖 — so it holds none.
 * Parts start appearing in the worlds beyond it. Per-world layouts dodge the
 * dunes/rocks (sim/terrain.ts) and the portal parked at (0,-6).
 */

export type PartEvent = "collected" | null;

const PICKUP = 1.0;
const PICKUP_SQ = PICKUP * PICKUP;
const GOLD = 0xffcf6a;

const SPOTS: Record<string, ReadonlyArray<readonly [number, number]>> = {
  mars: [
    [5, 5],
    [-6, -3],
    [8, 1],
  ],
  snow: [
    [6, 4],
    [-5, -5],
    [-8, 2],
  ],
};

interface Part {
  readonly group: THREE.Group;
  readonly center: THREE.Vector3;
  readonly baseY: number;
  taken: boolean;
}

export class Parts {
  readonly mesh = new THREE.Group();

  private parts: Part[] = [];
  /** Parts taken in the current world this visit. */
  collected = 0;
  /** Parts assembled across the whole journey — only ever grows (drives heft). */
  totalTaken = 0;

  /** Rebuild the collectible set for a world (fresh each visit). */
  setUniverse(id: string): void {
    this.clear();
    this.collected = 0;
    const spots = SPOTS[id] ?? [];
    for (const [x, z] of spots) {
      const baseY = 0.62 + heightAtWorld(x, z, id); // float above the terrain, not flat ground
      const group = makePart();
      group.position.set(x, baseY, z);
      this.mesh.add(group);
      this.parts.push({ group, center: new THREE.Vector3(x, 0, z), baseY, taken: false });
    }
  }

  /** Feed 迪迪's position each frame; returns "collected" on a fresh pickup. */
  update(pos: { x: number; z: number }, nowMs: number): PartEvent {
    let event: PartEvent = null;
    for (const part of this.parts) {
      if (part.taken) {
        continue;
      }
      // Bob and spin so it reads as a live, wantable thing.
      part.group.position.y = part.baseY + Math.sin(nowMs / 520 + part.center.x) * 0.08;
      part.group.rotation.y = nowMs / 900;

      const dx = pos.x - part.center.x;
      const dz = pos.z - part.center.z;
      if (dx * dx + dz * dz < PICKUP_SQ) {
        part.taken = true;
        part.group.visible = false;
        this.collected += 1;
        this.totalTaken += 1;
        event = "collected";
      }
    }
    return event;
  }

  private clear(): void {
    for (const part of this.parts) {
      this.mesh.remove(part.group);
      part.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const m of mats) m.dispose();
        }
      });
    }
    this.parts = [];
  }
}

/** A small glowing component: faceted core, a halo ring, a ground glow pad. */
function makePart(): THREE.Group {
  const group = new THREE.Group();

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.2, 0),
    new THREE.MeshStandardMaterial({
      color: 0x3a2a10,
      emissive: GOLD,
      emissiveIntensity: 0.9,
      roughness: 0.35,
      metalness: 0.6,
    }),
  );
  core.castShadow = true;
  group.add(core);

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.32, 0.02, 10, 32),
    new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.7, fog: false }),
  );
  halo.rotation.x = Math.PI / 2;
  group.add(halo);

  // Ground glow so it's findable from a distance and reads when edge-on.
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 28),
    new THREE.MeshBasicMaterial({
      color: GOLD,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = -0.6;
  group.add(pad);

  return group;
}
