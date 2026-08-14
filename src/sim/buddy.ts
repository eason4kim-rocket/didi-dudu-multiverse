import * as CANNON from "cannon-es";
import * as THREE from "three";
import { COLORS, metal, plastic } from "../render/materials";
import type { Chirps } from "../audio/chirps";
import type { ControlState, EmoteKind } from "../control/commands";
import type { Bb8Body } from "./bb8-body";

/**
 * 独独 (DuDu): a D-O style one-wheel scout, BB-8's timid sidekick.
 * Same scale as BB-8 (wheel ~450mm, head-top ~670mm at 1u = 462mm).
 *
 * Buildable layout: one wide barrel wheel with an internal pendulum for
 * balance (same trick as BB-8's drive unit), a fork over the axle, and a
 * telescoping neck with a cone head on a pan/tilt gimbal.
 */

const WHEEL_RADIUS = 0.49;
const WHEEL_HALF_WIDTH = 0.34; // scale factor on x for the squashed sphere
const NECK_LENGTH = 0.72;
const FOLLOW_DISTANCE = 1.6;
const MAX_FORCE = 42;
const MAX_SPEED = 3.3;

export class Buddy {
  readonly mesh: THREE.Group;
  readonly physics: CANNON.Body;

  private yaw = 0;
  private roll = 0;
  private lean = 0;
  private neckExt = 1;
  private prevForwardSpeed = 0;
  private prevDist = 0;
  private flinchUntil = 0;
  private flinchCooldown = 0;
  private nextChirp = performance.now() + 4000;
  private gesture: EmoteKind | null = null;
  private gestureStart = 0;
  private gestureDir = 1;
  private readonly g = { headYaw: 0, headPitch: 0, headRoll: 0, neck: 0, rock: 0 };

  private readonly leanGroup: THREE.Group;
  private readonly wheelSpin: THREE.Group;
  private readonly neckScale: THREE.Group;
  private readonly headGroup: THREE.Group;
  private readonly internals: THREE.Group;
  private readonly pendulum: THREE.Group;
  private headYaw = 0;
  private headPitch = 0;

  constructor(material: CANNON.Material) {
    const parts = createDuduMesh();
    this.mesh = parts.group;
    this.leanGroup = parts.lean;
    this.wheelSpin = parts.wheelSpin;
    this.neckScale = parts.neckScale;
    this.headGroup = parts.headGroup;
    this.internals = parts.internals;
    this.pendulum = parts.pendulum;

    this.physics = new CANNON.Body({
      mass: 4,
      material,
      linearDamping: 0.5,
      angularDamping: 0.9,
      fixedRotation: true,
      allowSleep: false,
      position: new CANNON.Vec3(1.9, WHEEL_RADIUS + 0.02, -1.6),
    });
    this.physics.addShape(new CANNON.Sphere(WHEEL_RADIUS));
    this.physics.collisionFilterGroup = 1;
    this.physics.collisionFilterMask = 1;
  }

  attach(world: CANNON.World): void {
    world.addBody(this.physics);
  }

  /** Autonomous duckling mode: tag along behind BB-8. */
  update(bb8: Bb8Body, audio: Chirps, dt: number): void {
    const now = performance.now();
    const pos = this.physics.position;
    const target = bb8.physics.position;
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const flinching = now < this.flinchUntil;

    // Startle when BB-8 rushes straight at it.
    const closing = (dist - this.prevDist) / Math.max(dt, 1 / 120);
    this.prevDist = dist;
    if (closing < -2.4 && dist < 2.4 && now > this.flinchCooldown) {
      this.scare();
      audio.play("scared", 0.03, 1, "dudu");
    }

    // Tag along, but freeze while flinching (too scared to move).
    const pushing = !flinching && dist > FOLLOW_DISTANCE + 0.15;
    this.physics.linearDamping = pushing ? 0.3 : 0.92;
    if (pushing) {
      const gap = dist - FOLLOW_DISTANCE;
      const push = Math.min(gap * 16, MAX_FORCE);
      const speed = Math.hypot(this.physics.velocity.x, this.physics.velocity.z);
      if (speed < MAX_SPEED) {
        this.physics.applyForce(
          new CANNON.Vec3((dx / dist) * push, 0, (dz / dist) * push),
          pos,
        );
      }
    }

    // A single wheel faces its direction of travel; parked, it faces BB-8.
    const vx = this.physics.velocity.x;
    const vz = this.physics.velocity.z;
    const moving = Math.hypot(vx, vz) > 0.15;
    const targetYaw = moving ? Math.atan2(vx, vz) : Math.atan2(dx, dz);
    this.yaw += shortestAngle(this.yaw, targetYaw) * Math.min(1, 5 * dt);

    // Head keeps eye contact with BB-8's head.
    const lookYaw = clamp(shortestAngle(this.yaw, Math.atan2(dx, dz)), -1.1, 1.1);
    const headWorldY = WHEEL_RADIUS + 0.42 + NECK_LENGTH * this.neckExt;
    const pitchDown = Math.atan2(headWorldY - (target.y + 0.5), Math.max(dist, 0.4));
    this.aimHead(lookYaw, clamp(pitchDown, -0.5, 0.6), dt);

    this.maybeChirp(moving, audio);
    this.settle(dt);
  }

  /** Manual driving mode, sharing BB-8's control vocabulary. */
  drive(state: ControlState, audio: Chirps, dt: number): void {
    const flinching = performance.now() < this.flinchUntil;
    this.yaw += state.turn * 2.4 * dt;

    const throttling = !flinching && Math.abs(state.drive) > 0.05;
    this.physics.linearDamping = throttling ? 0.3 : 0.92;
    if (throttling) {
      const speed = Math.hypot(this.physics.velocity.x, this.physics.velocity.z);
      if (speed < MAX_SPEED) {
        const force = state.drive * 48;
        this.physics.applyForce(
          new CANNON.Vec3(Math.sin(this.yaw) * force, 0, Math.cos(this.yaw) * force),
          this.physics.position,
        );
      }
    }

    this.aimHead(
      clamp(state.lookYaw * 1.4, -1.1, 1.1),
      clamp(-state.lookPitch * 1.6, -0.6, 0.6),
      dt,
    );

    const moving =
      Math.hypot(this.physics.velocity.x, this.physics.velocity.z) > 0.15;
    this.maybeChirp(moving, audio);
    this.settle(dt);
  }

  /** Ghost the shell and reveal the pendulum drive inside the wheel. */
  setCutaway(on: boolean): void {
    this.mesh.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object.userData.internal) {
        return;
      }
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial)) {
          continue;
        }
        material.transparent = on;
        material.opacity = on ? 0.16 : 1;
        material.depthWrite = !on;
        material.needsUpdate = true;
      }
    });
    this.internals.visible = on;
  }

  /** Snap the neck in: used for the scared emote and near-miss reactions. */
  scare(): void {
    const now = performance.now();
    this.flinchUntil = now + 1000;
    this.flinchCooldown = now + 4500;
  }

  /** DuDu's own acting, built around its neck and lampshade head. */
  triggerEmote(kind: EmoteKind): void {
    this.gesture = kind;
    this.gestureStart = performance.now();
    this.gestureDir = Math.random() < 0.5 ? -1 : 1;
    if (kind === "scared") {
      this.scare();
    }
  }

  private updateGesture(): void {
    const g = this.g;
    g.headYaw = 0;
    g.headPitch = 0;
    g.headRoll = 0;
    g.neck = 0;
    g.rock = 0;
    if (!this.gesture) {
      return;
    }
    const t = (performance.now() - this.gestureStart) / 1000 / DUDU_GESTURE_DURATION[this.gesture];
    if (t >= 1) {
      this.gesture = null;
      return;
    }
    const fade = 1 - t;
    const dir = this.gestureDir;
    switch (this.gesture) {
      case "chirp":
        // A small perk: neck stretches a touch, head lifts.
        g.neck = 0.08 * Math.sin(Math.PI * t);
        g.headPitch = -0.1 * Math.sin(Math.PI * t);
        break;
      case "yes":
        // Timid pause, then two eager lampshade nods.
        g.headPitch = t < 0.2 ? 0.06 : 0.35 * Math.sin((t - 0.2) * Math.PI * 5) * fade;
        break;
      case "no":
        // Shakes the whole lampshade by rolling it side to side.
        g.headRoll = dir * 0.45 * Math.sin(t * Math.PI * 3) * fade;
        g.headYaw = dir * 0.12 * Math.sin(t * Math.PI * 3) * fade;
        break;
      case "curious":
        // Stretches the neck out and cocks the head over.
        g.neck = 0.18 * Math.sin(Math.PI * Math.min(t * 1.3, 1));
        g.headRoll = dir * 0.3 * Math.sin(Math.PI * t);
        g.headPitch = -0.12 * Math.sin(Math.PI * t);
        break;
      case "excited": {
        // Rocks the whole wheel side to side while the neck bounces.
        g.rock = 0.18 * Math.sin(t * Math.PI * 8) * fade;
        g.neck = 0.1 * Math.abs(Math.sin(t * Math.PI * 5)) * fade;
        g.headRoll = 0.15 * Math.sin(t * Math.PI * 8) * fade;
        break;
      }
      case "scared":
        // Neck snap handled by scare(); add a quiver on top.
        g.headRoll = 0.08 * Math.sin(t * Math.PI * 24) * fade;
        break;
    }
  }

  private aimHead(yawTarget: number, pitchTarget: number, dt: number): void {
    const flinchPitch = -(1 - this.neckExt) * 0.55;
    this.headYaw += (yawTarget - this.headYaw) * Math.min(1, 7 * dt);
    this.headPitch +=
      (pitchTarget + flinchPitch - this.headPitch) * Math.min(1, 7 * dt);
  }

  private maybeChirp(moving: boolean, audio: Chirps): void {
    const now = performance.now();
    if (now > this.nextChirp) {
      if (moving || Math.random() < 0.4) {
        audio.play(Math.random() < 0.3 ? "curious" : "chirp", 0.04, 1, "dudu");
      }
      this.nextChirp = now + 5000 + Math.random() * 6000;
    }
  }

  /** Wheel roll, acceleration lean, neck extension, gestures, mesh sync. */
  private settle(dt: number): void {
    this.updateGesture();
    const flinching = performance.now() < this.flinchUntil;
    const pos = this.physics.position;
    const vx = this.physics.velocity.x;
    const vz = this.physics.velocity.z;

    const forwardSpeed = vx * Math.sin(this.yaw) + vz * Math.cos(this.yaw);
    this.roll += (forwardSpeed * dt) / WHEEL_RADIUS;
    const accel = (forwardSpeed - this.prevForwardSpeed) / Math.max(dt, 1 / 120);
    this.prevForwardSpeed = forwardSpeed;
    this.lean += (clamp(accel * 0.05, -0.26, 0.26) - this.lean) * Math.min(1, 7 * dt);

    const extTarget = (flinching ? 0.42 : 1) + this.g.neck;
    this.neckExt += (extTarget - this.neckExt) * Math.min(1, 6 * dt);

    this.mesh.position.set(pos.x, pos.y, pos.z);
    this.mesh.rotation.set(0, this.yaw + this.g.rock, 0);
    this.wheelSpin.rotation.x = this.roll;
    this.leanGroup.rotation.x = this.lean;
    // The drive pendulum swings forward to accelerate, back to brake.
    this.pendulum.rotation.x = this.lean * 2.6;
    this.neckScale.scale.y = this.neckExt;
    this.headGroup.position.y = NECK_LENGTH * this.neckExt;
    this.headGroup.rotation.set(
      this.headPitch + this.g.headPitch,
      this.headYaw + this.g.headYaw,
      this.g.headRoll,
    );
  }
}

const DUDU_GESTURE_DURATION: Record<EmoteKind, number> = {
  chirp: 0.5,
  excited: 1.4,
  curious: 1.6,
  yes: 1.0,
  no: 1.1,
  scared: 1.2,
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

function strut(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  mat: THREE.Material,
): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 10), mat);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.normalize(),
  );
  mesh.castShadow = true;
  return mesh;
}

function createDuduMesh(): {
  group: THREE.Group;
  lean: THREE.Group;
  wheelSpin: THREE.Group;
  neckScale: THREE.Group;
  headGroup: THREE.Group;
  internals: THREE.Group;
  pendulum: THREE.Group;
} {
  const group = new THREE.Group();
  const cream = plastic(0xf2ede2, { roughness: 0.45 });
  const cream2 = plastic(0xe4ddcf, { roughness: 0.5 });
  const orange = plastic(0xd9622b, { roughness: 0.5 });
  const dark = plastic(0x2a2c2f, { roughness: 0.5 });

  // Barrel wheel: a squashed sphere reads as a wide rounded tire.
  const wheelSpin = new THREE.Group();
  group.add(wheelSpin);

  const tire = new THREE.Mesh(new THREE.SphereGeometry(WHEEL_RADIUS, 48, 32), cream);
  tire.scale.set(WHEEL_HALF_WIDTH, 1, 1);
  tire.castShadow = true;
  wheelSpin.add(tire);

  // Orange tread stripe around the rolling circumference.
  const stripe = new THREE.Mesh(
    new THREE.TorusGeometry(WHEEL_RADIUS * 0.94, 0.05, 12, 64),
    orange,
  );
  stripe.rotation.y = Math.PI / 2;
  wheelSpin.add(stripe);

  // Cone hubs on both sides.
  for (const side of [-1, 1]) {
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.17, 0.09, 24), orange);
    hub.rotation.z = side * (Math.PI / 2);
    hub.position.x = side * (WHEEL_RADIUS * WHEEL_HALF_WIDTH + 0.02);
    wheelSpin.add(hub);
  }

  // Everything that leans with acceleration (fork + neck + head).
  const lean = new THREE.Group();
  group.add(lean);

  const neckBase = new THREE.Vector3(0, 0.42, -0.2);
  for (const side of [-1, 1]) {
    const hubPoint = new THREE.Vector3(
      side * (WHEEL_RADIUS * WHEEL_HALF_WIDTH + 0.05),
      0,
      0,
    );
    lean.add(strut(hubPoint, neckBase, 0.022, metal(COLORS.steel)));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), metal(COLORS.steel));
    cap.position.copy(hubPoint);
    lean.add(cap);
  }

  // Telescoping neck: scaled from its base so it retracts naturally.
  const neckGroup = new THREE.Group();
  neckGroup.position.copy(neckBase);
  neckGroup.rotation.x = 0.14;
  lean.add(neckGroup);

  const neckScale = new THREE.Group();
  neckGroup.add(neckScale);
  const neckSeg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.026, 0.034, NECK_LENGTH, 12),
    metal(COLORS.steel),
  );
  neckSeg.position.y = NECK_LENGTH / 2;
  neckSeg.castShadow = true;
  neckScale.add(neckSeg);
  const neckSleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.05, NECK_LENGTH * 0.4, 12),
    cream2,
  );
  neckSleeve.position.y = NECK_LENGTH * 0.2;
  neckScale.add(neckSleeve);

  // Cone head, wide face forward, like a friendly desk lamp.
  const headGroup = new THREE.Group();
  headGroup.position.y = NECK_LENGTH;
  neckGroup.add(headGroup);

  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.09, 0.34, 32), cream);
  cone.rotation.x = Math.PI / 2;
  cone.castShadow = true;
  headGroup.add(cone);

  const facePlate = new THREE.Mesh(new THREE.CircleGeometry(0.235, 32), cream2);
  facePlate.position.z = 0.172;
  headGroup.add(facePlate);

  const faceRing = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 8, 40), orange);
  faceRing.position.z = 0.174;
  headGroup.add(faceRing);

  // Two round eyes side by side.
  for (const side of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.02, 24), dark);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(side * 0.09, 0.02, 0.178);
    headGroup.add(ring);

    const lens = new THREE.Mesh(
      new THREE.SphereGeometry(0.047, 20, 14),
      plastic(COLORS.lens, { roughness: 0.12, metalness: 0.6 }),
    );
    lens.scale.z = 0.55;
    lens.position.set(side * 0.09, 0.02, 0.186);
    headGroup.add(lens);

    const glint = new THREE.Mesh(
      new THREE.CircleGeometry(0.011, 8),
      new THREE.MeshBasicMaterial({ color: 0xdde7f2 }),
    );
    glint.position.set(side * 0.09 - 0.015, 0.038, 0.215);
    headGroup.add(glint);
  }

  // Four droopy antennae on the back of the head.
  const antennaSpots: Array<[number, number, number, number]> = [
    [-0.06, 0.3, -0.25, 0.34],
    [-0.02, 0.34, -0.32, 0.42],
    [0.03, 0.33, -0.28, 0.38],
    [0.07, 0.29, -0.22, 0.3],
  ];
  for (const [x, tiltX, tiltZ, len] of antennaSpots) {
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0035, 0.005, len, 6),
      metal(COLORS.silver),
    );
    antenna.position.set(x, 0.1 + len * 0.4, -0.1);
    antenna.rotation.set(tiltZ, 0, tiltX);
    headGroup.add(antenna);
  }

  // --- Internals (cutaway only): the pendulum drive inside the wheel. ---
  // The wheel spins freely around a fixed axle; a motorised pendulum mass
  // hangs from that axle. Swinging the mass forward torques the wheel —
  // the same reaction-mass trick BB-8 uses, packed into one wheel.
  const internals = new THREE.Group();
  internals.visible = false;
  group.add(internals);
  const steel = metal(COLORS.steel);
  const darkMetal = metal(0x1b1c1e);

  const axleLen = WHEEL_RADIUS * WHEEL_HALF_WIDTH * 2 + 0.12;
  const axle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, axleLen, 14),
    steel,
  );
  axle.rotation.z = Math.PI / 2;
  internals.add(axle);

  // Pendulum: arm from the axle down to the motor + battery mass.
  const pendulum = new THREE.Group();
  internals.add(pendulum);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.03), darkMetal);
  arm.position.y = -0.15;
  pendulum.add(arm);
  const motor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 0.12, 14),
    steel,
  );
  motor.rotation.z = Math.PI / 2;
  motor.position.y = -0.3;
  pendulum.add(motor);
  const batt = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.07, 0.1),
    plastic(0x2c3e50, { roughness: 0.6 }),
  );
  batt.position.y = -0.38;
  pendulum.add(batt);
  // Drive gear meshing the wheel hub.
  const gear = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 0.025, 18),
    darkMetal,
  );
  gear.rotation.z = Math.PI / 2;
  gear.position.set(0.06, -0.02, 0);
  pendulum.add(gear);

  // Neck servos at the fork's crown (pan + tilt).
  const servoBox = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.07), darkMetal);
  servoBox.position.copy(neckBase).add(new THREE.Vector3(0, -0.02, 0));
  internals.add(servoBox);
  const servoDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.028, 0.02, 14),
    steel,
  );
  servoDisc.position.copy(neckBase).add(new THREE.Vector3(0, 0.02, 0));
  internals.add(servoDisc);

  internals.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.userData.internal = true;
    }
  });

  return { group, lean, wheelSpin, neckScale, headGroup, internals, pendulum };
}
