import * as CANNON from "cannon-es";
import * as THREE from "three";
import type { ControlState, EmoteKind } from "../control/commands";
import { COLORS, metal, plastic } from "../render/materials";
import { makeHeadTexture } from "../render/bb8-textures";
import {
  BODY_RADIUS,
  HEAD_BASE_BAND_H,
  HEAD_BASE_CONE_H,
  HEAD_POS_SMOOTH,
  HEAD_RADIUS,
  HEAD_SIT,
  LOOK_SPEED,
  MAX_LOOK_YAW,
} from "./constants";
import type { Bb8Body } from "./bb8-body";

export class Bb8Head {
  readonly mesh: THREE.Group;

  private readonly magnet = new THREE.Vector3();
  private readonly smoothedMagnet = new THREE.Vector3(0, 1, 0);
  private readonly targetEuler = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly currentEuler = new THREE.Euler(0, 0, 0, "YXZ");
  private prevSpeed = 0;
  private accelLean = 0;
  private gesture: EmoteKind | "glance" | null = null;
  private gestureStart = 0;
  private gestureDir = 1;
  private readonly gestureOut = { yaw: 0, pitch: 0, roll: 0, lift: 0 };

  /** 无头状态: when the head is knocked off it becomes a physical object. */
  detached = false;
  private headBody: CANNON.Body | null = null;
  private world: CANNON.World | null = null;

  constructor() {
    this.mesh = createHeadMesh();
    this.mesh.rotation.order = "YXZ";
    this.mesh.position.set(0, BODY_RADIUS - HEAD_SIT, 0);
  }

  /** Pop the head off: it falls, tumbles and rolls, carrying 迪迪's momentum. */
  detach(world: CANNON.World, material: CANNON.Material, momentum: CANNON.Vec3): void {
    if (this.detached) {
      return;
    }
    const p = this.mesh.position;
    const body = new CANNON.Body({
      mass: 0.35,
      material,
      linearDamping: 0.28,
      angularDamping: 0.3,
      position: new CANNON.Vec3(p.x, p.y, p.z),
      collisionFilterGroup: 1,
      collisionFilterMask: 1,
    });
    body.addShape(new CANNON.Sphere(HEAD_RADIUS * 0.8));
    body.velocity.set(momentum.x * 0.6, 3.2, momentum.z * 0.6); // pop up + forward
    body.angularVelocity.set(
      (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 12,
    );
    world.addBody(body);
    this.headBody = body;
    this.world = world;
    this.detached = true;
    this.gesture = null;
  }

  /** 独独 (or 迪迪) got the head back: re-seat it on the ball. */
  recover(): void {
    if (this.headBody && this.world) {
      this.world.removeBody(this.headBody);
    }
    this.headBody = null;
    this.world = null;
    this.detached = false;
    this.mesh.rotation.set(0, 0, 0);
  }

  /** World position of the lost head — for pickup range and 独独's rescue. */
  headPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.headBody
      ? out.set(this.headBody.position.x, this.headBody.position.y, this.headBody.position.z)
      : out.copy(this.mesh.position);
  }

  triggerEmote(kind: EmoteKind): void {
    this.gesture = kind;
    this.gestureStart = performance.now();
    this.gestureDir = Math.random() < 0.5 ? -1 : 1;
  }

  /** Idle look-around: a slow glance to one side and back. */
  glance(): void {
    this.gesture = "glance";
    this.gestureStart = performance.now();
    this.gestureDir = Math.random() < 0.5 ? -1 : 1;
  }

  get busy(): boolean {
    return this.gesture !== null;
  }

  sync(body: Bb8Body, state: ControlState, dt: number): void {
    // Knocked off: ride the physics body, tumbling on the ground, not the ball.
    if (this.detached) {
      if (this.headBody) {
        const p = this.headBody.position;
        const q = this.headBody.quaternion;
        this.mesh.position.set(p.x, p.y - HEAD_RADIUS * 0.55, p.z);
        this.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      }
      return;
    }

    this.updateGesture();
    const pos = body.physics.position;
    body.magnetDirection(this.magnet);
    // Smooth the lean direction only; the head itself rides the ball with no
    // positional lag, so it never trails behind at speed.
    const posK = 1 - Math.exp(-HEAD_POS_SMOOTH * dt);
    this.smoothedMagnet.lerp(this.magnet, posK).normalize();
    const sit = BODY_RADIUS - HEAD_SIT;
    this.mesh.position.set(
      pos.x + this.smoothedMagnet.x * sit,
      pos.y + this.smoothedMagnet.y * sit + this.gestureOut.lift,
      pos.z + this.smoothedMagnet.z * sit,
    );

    const forwardSpeed =
      body.physics.velocity.x * Math.sin(body.heading) +
      body.physics.velocity.z * Math.cos(body.heading);
    const accel = (forwardSpeed - this.prevSpeed) / Math.max(dt, 1 / 120);
    this.prevSpeed = forwardSpeed;
    this.accelLean += (clamp(-accel * 0.04, -0.14, 0.14) - this.accelLean) * Math.min(1, 8 * dt);

    const lookYaw = clamp(state.lookYaw, -MAX_LOOK_YAW, MAX_LOOK_YAW);
    const yaw = body.heading + lookYaw;
    // Decompose the lean into the head's own frame, so leaning forward reads
    // as pitch (not sideways roll) no matter which way BB-8 is heading.
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const forwardLean = this.smoothedMagnet.x * sy + this.smoothedMagnet.z * cy;
    const sideLean = this.smoothedMagnet.x * cy - this.smoothedMagnet.z * sy;
    const pitch = state.lookPitch - forwardLean * 0.35 + this.accelLean;
    const roll = sideLean * 0.35;

    this.targetEuler.set(pitch, yaw, roll);
    const k = 1 - Math.exp(-LOOK_SPEED * dt);
    this.currentEuler.x += (this.targetEuler.x - this.currentEuler.x) * k;
    this.currentEuler.y += shortestAngle(this.currentEuler.y, this.targetEuler.y) * k;
    this.currentEuler.z += (this.targetEuler.z - this.currentEuler.z) * k;
    // Gesture offsets go on top of the smoothed pose so they stay snappy.
    this.mesh.rotation.set(
      this.currentEuler.x + this.gestureOut.pitch,
      this.currentEuler.y + this.gestureOut.yaw,
      this.currentEuler.z + this.gestureOut.roll,
    );
  }

  /**
   * Film-style acted moves, expressed as additive head offsets over time.
   * Sign convention: positive pitch = nose down, positive lift = hop up.
   */
  private updateGesture(): void {
    const g = this.gestureOut;
    g.yaw = 0;
    g.pitch = 0;
    g.roll = 0;
    g.lift = 0;
    if (!this.gesture) {
      return;
    }
    const dur = GESTURE_DURATION[this.gesture];
    const t = (performance.now() - this.gestureStart) / 1000 / dur;
    if (t >= 1) {
      this.gesture = null;
      return;
    }
    const fade = 1 - t;
    const dir = this.gestureDir;
    switch (this.gesture) {
      case "chirp":
        // A tiny perk-up.
        g.pitch = -0.09 * Math.sin(Math.PI * t);
        g.lift = 0.02 * Math.sin(Math.PI * t);
        break;
      case "yes":
        // Two decisive nods.
        g.pitch = 0.26 * Math.sin(t * Math.PI * 4) * (0.4 + 0.6 * fade);
        break;
      case "no":
        // Left-right-left head shake.
        g.yaw = 0.5 * Math.sin(t * Math.PI * 3) * fade;
        break;
      case "curious":
        // Slow puppy-like head tilt with a slight look up.
        g.roll = dir * 0.3 * Math.sin(Math.PI * Math.min(t * 1.25, 1));
        g.pitch = -0.08 * Math.sin(Math.PI * t);
        break;
      case "excited": {
        // Fast happy wiggle with little hops.
        const bounce = Math.abs(Math.sin(t * Math.PI * 5)) * fade;
        g.yaw = 0.28 * Math.sin(t * Math.PI * 9) * fade;
        g.pitch = -0.1 * bounce;
        g.lift = 0.035 * bounce;
        break;
      }
      case "scared": {
        // Head snaps back and ducks, then a shiver while recovering.
        const jerk = Math.min(1, t / 0.18);
        const recover = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
        g.pitch = -0.32 * jerk * recover;
        g.lift = -0.045 * jerk * recover;
        g.roll = 0.05 * Math.sin(t * Math.PI * 26) * recover;
        break;
      }
      case "glance": {
        // Casual look to one side and back.
        const s = Math.sin(Math.PI * t);
        g.yaw = dir * 0.55 * s;
        g.roll = dir * 0.07 * s;
        break;
      }
    }
  }
}

const GESTURE_DURATION: Record<EmoteKind | "glance", number> = {
  chirp: 0.5,
  excited: 1.3,
  curious: 1.5,
  yes: 0.9,
  no: 1.1,
  scared: 1.3,
  glance: 2.4,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function shortestAngle(from: number, to: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function createHeadMesh(): THREE.Group {
  const group = new THREE.Group();
  const r = HEAD_RADIUS;
  const domeBaseY = HEAD_BASE_CONE_H + HEAD_BASE_BAND_H;

  // Screen head is dome + short skirt band + inward-tapering cone (rimstar
  // measurements: base 31mm band, 20mm cone, cone bottom 223mm of 295mm).
  const cone = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.94, r * 0.755, HEAD_BASE_CONE_H, 48),
    metal(COLORS.steel),
  );
  cone.position.y = HEAD_BASE_CONE_H / 2;
  cone.castShadow = true;
  group.add(cone);

  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.965, r * 0.94, HEAD_BASE_BAND_H, 48),
    plastic(COLORS.silver, { metalness: 0.4, roughness: 0.3 }),
  );
  band.position.y = HEAD_BASE_CONE_H + HEAD_BASE_BAND_H / 2;
  band.castShadow = true;
  group.add(band);

  // Everything above the base lives in the dome group.
  const domeGroup = new THREE.Group();
  domeGroup.position.y = domeBaseY;
  group.add(domeGroup);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(r, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({
      map: makeHeadTexture(),
      roughness: 0.38,
      metalness: 0.05,
    }),
  );
  dome.castShadow = true;
  domeGroup.add(dome);

  // Main photoreceptor mid-front (lens ~20% of head diameter on the prop),
  // small lens down near the orange band.
  domeGroup.add(createEye(r, 0.78, 0, 0.062, true));
  domeGroup.add(createEye(r, 1.15, -0.45, 0.028, false));

  // Straight antenna and the taller tipped one, like the film.
  const shortAntenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.006, 0.16, 8),
    metal(COLORS.silver),
  );
  shortAntenna.position.set(0.05, r + 0.06, -0.06);
  domeGroup.add(shortAntenna);

  const tallAntenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.007, 0.28, 8),
    metal(COLORS.silver),
  );
  tallAntenna.position.set(-0.045, r + 0.115, -0.06);
  domeGroup.add(tallAntenna);

  const tip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8),
    metal(COLORS.dark),
  );
  tip.position.set(-0.045, r + 0.23, -0.06);
  domeGroup.add(tip);

  return group;
}

function createEye(
  headRadius: number,
  polar: number,
  azimuth: number,
  size: number,
  main: boolean,
): THREE.Group {
  const eye = new THREE.Group();

  // Dark surround ring, silver trim, then the glossy black lens.
  const surround = new THREE.Mesh(
    new THREE.CylinderGeometry(size * 1.3, size * 1.3, 0.018, 32),
    plastic(0x2a2c2f, { roughness: 0.5 }),
  );
  surround.rotation.x = Math.PI / 2;
  eye.add(surround);

  const trim = new THREE.Mesh(
    new THREE.TorusGeometry(size * 1.28, 0.008, 10, 32),
    metal(COLORS.silver),
  );
  trim.position.z = 0.008;
  eye.add(trim);

  const lens = new THREE.Mesh(
    new THREE.SphereGeometry(size, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2),
    plastic(COLORS.lens, { roughness: 0.12, metalness: 0.6 }),
  );
  lens.rotation.x = Math.PI / 2;
  lens.scale.z = 0.55;
  lens.position.z = 0.01;
  eye.add(lens);

  const glint = new THREE.Mesh(
    new THREE.CircleGeometry(size * 0.18, 10),
    new THREE.MeshBasicMaterial({ color: 0xdde7f2 }),
  );
  glint.position.set(-size * 0.3, size * 0.26, size * 0.58 + 0.012);
  eye.add(glint);

  if (main) {
    const brow = new THREE.Mesh(
      new THREE.TorusGeometry(size * 1.5, 0.006, 8, 32, Math.PI * 1.25),
      metal(COLORS.steel),
    );
    brow.rotation.z = Math.PI * 0.88;
    brow.position.z = 0.004;
    eye.add(brow);
  }

  const normal = new THREE.Vector3().setFromSphericalCoords(1, polar, azimuth);
  eye.position.copy(normal).multiplyScalar(headRadius + 0.004);
  eye.lookAt(normal.multiplyScalar(headRadius * 2));
  return eye;
}

