import * as THREE from "three";
import { heightAtWorld } from "../sim/heightfield";

/**
 * 信标碎片 — the beacon shard (节拍0 cold open). A splinter of "the real world"
 * that fell through a crack into the opening world. It pulses, chirps 迪迪's own
 * voice back but broken (see Chirps.playBroken), answers when 迪迪 calls near it,
 * and points a hint beam toward the 门 — "the sound comes from over there". It's
 * the WHY: there's another, unfinished 迪迪 out beyond the screen.
 */

const CORE = 0x9fe9ff; // electric cyan-white — rhymes with the portal it points to
const ACTIVE_WORLD = "dusk"; // it landed in the opening world
const PROVOKE_R = 5;
const PROVOKE_R_SQ = PROVOKE_R * PROVOKE_R;

export class Beacon {
  readonly mesh = new THREE.Group();
  readonly center = new THREE.Vector3();

  private active = false;
  private nextEmit = 0;
  private pendingAnswer = 0;
  private readonly shards: THREE.Mesh[] = [];
  private readonly pad: THREE.Mesh;
  private readonly beam: THREE.Mesh;
  private readonly wisp: THREE.Mesh;

  constructor(x: number, z: number, portalX: number, portalZ: number) {
    const y = heightAtWorld(x, z, ACTIVE_WORLD);
    this.center.set(x, y, z);
    this.mesh.position.set(x, y, z);

    const mat = () =>
      new THREE.MeshStandardMaterial({
        color: 0x0a1c22,
        emissive: CORE,
        emissiveIntensity: 1.4,
        roughness: 0.3,
        metalness: 0.4,
      });
    // A little cluster of half-buried crystalline shards (bottoms in the sand).
    const shardSpecs: Array<[number, number, number, number, number]> = [
      [0.16, 0.62, 0, 0, 0.12],
      [0.1, 0.42, 0.2, 0.09, -0.5],
      [0.08, 0.34, -0.15, -0.07, 0.6],
    ];
    for (const [r, h, sx, sz, tilt] of shardSpecs) {
      const shard = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), mat());
      shard.position.set(sx, h * 0.5 - 0.16, sz); // sink the base below ground
      shard.rotation.z = tilt;
      shard.castShadow = true;
      this.mesh.add(shard);
      this.shards.push(shard);
    }

    this.pad = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 32),
      new THREE.MeshBasicMaterial({
        color: CORE,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    this.pad.rotation.x = -Math.PI / 2;
    this.pad.position.y = 0.02;
    this.mesh.add(this.pad);

    // A faint signal wisp rising from the shard — findable from afar, and it
    // reads as a signal reaching up and out toward wherever the real one is.
    this.wisp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.2, 3.2, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color: CORE,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    this.wisp.position.y = 1.6;
    this.mesh.add(this.wisp);

    // Hint beam: a flowing streak along the ground toward the 门.
    const dir = Math.atan2(portalX - x, portalZ - z);
    const len = 3.4;
    const beamGroup = new THREE.Group();
    beamGroup.rotation.y = dir;
    this.beam = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, len),
      new THREE.MeshBasicMaterial({
        map: makeBeamTexture(),
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    this.beam.rotation.x = -Math.PI / 2;
    this.beam.position.z = len / 2 + 0.5; // start just past the shard, run outward
    beamGroup.add(this.beam);
    this.mesh.add(beamGroup);
  }

  /** Only alive in the opening world — it fell into that one. */
  setUniverse(id: string): void {
    this.active = id === ACTIVE_WORLD;
    this.mesh.visible = this.active;
    this.pendingAnswer = 0;
    if (this.active) {
      this.nextEmit = performance.now() + 1500;
    }
  }

  /** 迪迪 called out near it → schedule a broken answer a beat later. */
  provoke(nowMs: number, pos: { x: number; z: number }): void {
    if (!this.active || this.pendingAnswer) {
      return;
    }
    const dx = pos.x - this.center.x;
    const dz = pos.z - this.center.z;
    if (dx * dx + dz * dz < PROVOKE_R_SQ) {
      this.pendingAnswer = nowMs + 340;
    }
  }

  /** Animate + report when the shard should sound (ambient emit, or an answer). */
  update(nowMs: number): boolean {
    if (!this.active) {
      return false;
    }
    const glow = 1.1 + 0.7 * Math.sin(nowMs / 360);
    for (const shard of this.shards) {
      (shard.material as THREE.MeshStandardMaterial).emissiveIntensity = glow;
    }
    (this.pad.material as THREE.MeshBasicMaterial).opacity = 0.16 + 0.1 * Math.sin(nowMs / 360);
    (this.wisp.material as THREE.MeshBasicMaterial).opacity = 0.14 + 0.09 * Math.sin(nowMs / 360 + 1);
    const beamMat = this.beam.material as THREE.MeshBasicMaterial;
    beamMat.opacity = 0.38 + 0.18 * Math.sin(nowMs / 300);
    if (beamMat.map) {
      beamMat.map.offset.y = -(nowMs / 2600) % 1; // flow toward the 门
    }

    if (this.pendingAnswer && nowMs >= this.pendingAnswer) {
      this.pendingAnswer = 0;
      return true;
    }
    if (nowMs >= this.nextEmit) {
      this.nextEmit = nowMs + 4500 + Math.random() * 3500;
      return true;
    }
    return false;
  }
}

/** Lengthwise dashed gradient so the hint beam reads as flowing motion. */
function makeBeamTexture(): THREE.CanvasTexture {
  const W = 16;
  const H = 128;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }
  const grad = ctx.createLinearGradient(0, H, 0, 0);
  grad.addColorStop(0, "rgba(159,233,255,0.9)"); // bright at the shard
  grad.addColorStop(1, "rgba(159,233,255,0)"); // fades toward the 门
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  // Dashes for a sense of travel.
  ctx.globalCompositeOperation = "destination-out";
  for (let y = 0; y < H; y += 16) {
    ctx.fillRect(0, y + 9, W, 7);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
