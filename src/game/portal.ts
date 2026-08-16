import * as THREE from "three";

/**
 * 平行宇宙之门 — the Portal. A standing gateway you roll 迪迪 (BB-8) into to
 * cross between worlds. It's the diegetic version of the U-key universe hop:
 * the spine of the core loop's `进传送门 → 物理世界` arrow.
 *
 * Feed 迪迪's position every frame. It fires "enter" once when the ball rolls
 * into the doorway, then disarms until the ball drives clear again — so you
 * pass through, the world reforms around you, and it won't re-trigger while
 * you're still standing in it.
 */

export type PortalEvent = "enter" | null;

const RING_R = 1.6;
const TUBE = 0.16;
const TRIGGER = 1.35; // horizontal distance from the doorway that counts as "through"
const TRIGGER_SQ = TRIGGER * TRIGGER;
const REARM = 2.4; // ball must roll this far clear before the door re-arms
const REARM_SQ = REARM * REARM;

const ACCENT = 0x5cc8ff; // portal cyan — deliberately distinct from the race's gold

export class Portal {
  readonly mesh = new THREE.Group();
  readonly center = new THREE.Vector3();

  private readonly ring: THREE.Mesh;
  private readonly membrane: THREE.Mesh;
  private armed = true;

  constructor(x: number, z: number, faceRad = 0) {
    this.center.set(x, 0, z);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = faceRad;

    // The doorway. A torus lies in its local XY plane with the hole along Z,
    // so it stands upright and you roll straight through along Z.
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(RING_R, TUBE, 18, 56),
      new THREE.MeshStandardMaterial({
        color: 0x0b1014,
        emissive: ACCENT,
        emissiveIntensity: 1,
        roughness: 0.35,
        metalness: 0.5,
      }),
    );
    this.ring.position.y = RING_R; // bottom tangent to the ground
    this.mesh.add(this.ring);

    // Shimmering event-horizon membrane across the opening.
    this.membrane = new THREE.Mesh(
      new THREE.CircleGeometry(RING_R - TUBE, 48),
      new THREE.MeshBasicMaterial({
        map: makePortalTexture(),
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.membrane.position.y = RING_R;
    this.mesh.add(this.membrane);

    // Ground pad so the spot still reads when the ring is edge-on or far.
    const pad = new THREE.Mesh(
      new THREE.RingGeometry(RING_R * 0.5, RING_R * 1.05, 40),
      new THREE.MeshBasicMaterial({
        color: ACCENT,
        transparent: true,
        opacity: 0.26,
        side: THREE.DoubleSide,
        depthWrite: false,
        fog: false,
      }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.02;
    this.mesh.add(pad);

    // Soft cyan beacon so the door is findable from across the arena.
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 9, 18, 1, true),
      new THREE.MeshBasicMaterial({
        color: ACCENT,
        transparent: true,
        opacity: 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    beam.position.y = 4.5;
    this.mesh.add(beam);
  }

  /** Feed 迪迪's position each frame; returns "enter" once per pass-through. */
  update(pos: { x: number; z: number }, nowMs: number): PortalEvent {
    // Keep it alive: pulse the ring, spin and breathe the membrane.
    const ringMat = this.ring.material as THREE.MeshStandardMaterial;
    ringMat.emissiveIntensity = 1 + 0.5 * Math.sin(nowMs / 300);
    this.membrane.rotation.z = nowMs / 2600;
    (this.membrane.material as THREE.MeshBasicMaterial).opacity =
      0.42 + 0.16 * Math.sin(nowMs / 420);

    const dx = pos.x - this.center.x;
    const dz = pos.z - this.center.z;
    const distSq = dx * dx + dz * dz;

    if (!this.armed) {
      if (distSq > REARM_SQ) {
        this.armed = true;
      }
      return null;
    }
    if (distSq < TRIGGER_SQ) {
      this.armed = false;
      return "enter";
    }
    return null;
  }

  /** Force a cooldown — used when the world is switched by key/button too. */
  disarm(): void {
    this.armed = false;
  }
}

/** Glowing vortex texture for the membrane: bright core, faint swirl, soft edge. */
function makePortalTexture(): THREE.CanvasTexture {
  const S = 256;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }
  const c = S / 2;

  // Radial core: white-hot centre bleeding into cyan, fading to transparent.
  const glow = ctx.createRadialGradient(c, c, 0, c, c, c);
  glow.addColorStop(0, "rgba(235,250,255,0.95)");
  glow.addColorStop(0.28, "rgba(120,210,255,0.6)");
  glow.addColorStop(0.7, "rgba(70,150,230,0.22)");
  glow.addColorStop(1, "rgba(70,150,230,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, S, S);

  // A few faint spiral arms so it reads as a vortex, not a flat disc.
  ctx.lineCap = "round";
  for (let arm = 0; arm < 5; arm += 1) {
    ctx.beginPath();
    const base = (arm / 5) * Math.PI * 2;
    for (let t = 0; t <= 1; t += 0.02) {
      const r = t * (c - 6);
      const a = base + t * 3.4;
      const x = c + Math.cos(a) * r;
      const y = c + Math.sin(a) * r;
      if (t === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = "rgba(210,244,255,0.14)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
