import * as CANNON from "cannon-es";
import * as THREE from "three";
import type { ControlState } from "../control/commands";
import { COLORS, metal, plastic } from "../render/materials";
import { runtimeGrip } from "../universes";
import {
  BRAKE_SPRING,
  CENTER_SPRING,
  DRIVE_FORCE,
  IDU_MASS,
  LATERAL_GRIP,
  MAX_SPEED,
  PENDULUM_DAMP,
  PENDULUM_DAMP_BRAKE,
  PENDULUM_LENGTH,
  ROLL_ALIGN,
  WHEEL_TORQUE,
} from "./constants";

export class InternalDriveUnit {
  readonly mesh: THREE.Group;
  readonly physics: CANNON.Body;
  readonly constraint: CANNON.DistanceConstraint;

  private readonly forward = new CANNON.Vec3();
  private readonly right = new CANNON.Vec3();
  private readonly force = new CANNON.Vec3();
  private readonly rel = new CANNON.Vec3();
  private readonly pose = new CANNON.Quaternion();

  // Animated internals: drive wheels roll with ground speed, gyro spins.
  private readonly leftWheel: THREE.Object3D;
  private readonly rightWheel: THREE.Object3D;
  private readonly flywheel: THREE.Object3D;
  private wheelAngle = 0;
  private flyAngle = 0;

  constructor(shell: CANNON.Body) {
    const parts = createIduMesh();
    this.mesh = parts.group;
    this.leftWheel = parts.leftWheel;
    this.rightWheel = parts.rightWheel;
    this.flywheel = parts.flywheel;
    this.mesh.visible = false;

    this.physics = new CANNON.Body({
      mass: IDU_MASS,
      linearDamping: 0.42,
      angularDamping: 0.82,
      allowSleep: false,
      position: new CANNON.Vec3(
        shell.position.x,
        shell.position.y - PENDULUM_LENGTH,
        shell.position.z,
      ),
    });
    this.physics.addShape(new CANNON.Box(new CANNON.Vec3(0.09, 0.05, 0.11)));
    this.physics.collisionFilterGroup = 2;
    this.physics.collisionFilterMask = 0;

    this.constraint = new CANNON.DistanceConstraint(
      shell,
      this.physics,
      PENDULUM_LENGTH,
      1e6,
    );
  }

  applyControl(shell: CANNON.Body, state: ControlState, heading: number, dt: number): void {
    this.forward.set(Math.sin(heading), 0, Math.cos(heading));
    this.right.set(this.forward.z, 0, -this.forward.x);

    const speed =
      shell.velocity.x * this.forward.x + shell.velocity.z * this.forward.z;

    // Wheels roll against the shell's inner surface; the gyro spins faster
    // the harder we drive (visual only, physics is the pendulum below).
    this.wheelAngle += (speed / DRIVE_WHEEL_R) * dt;
    this.flyAngle += (10 + Math.abs(speed) * 8) * dt;

    const driveScale = speed * state.drive > MAX_SPEED ? 0.12 : 1;
    const drive = state.drive * DRIVE_FORCE * driveScale;

    this.force.set(this.forward.x * drive, 0, this.forward.z * drive);
    this.physics.applyForce(this.force, this.physics.position);

    shell.torque.x += this.right.x * state.drive * WHEEL_TORQUE;
    shell.torque.z += this.right.z * state.drive * WHEEL_TORQUE;

    const coasting = Math.abs(state.drive) < 0.08;

    // Grip, only while actively driving: smoothly steer the velocity and
    // the rolling axis toward the heading so turns carve instead of drift.
    // Never touch a coasting ball — meddling there made turning the head
    // brake/steer the ball, which felt broken.
    if (!coasting) {
      const latBlend = 1 - Math.exp(-LATERAL_GRIP * runtimeGrip.scale * dt);
      const latSpeed =
        shell.velocity.x * this.right.x + shell.velocity.z * this.right.z;
      shell.velocity.x -= this.right.x * latSpeed * latBlend;
      shell.velocity.z -= this.right.z * latSpeed * latBlend;

      // The pendulum mass carries momentum from the old direction and drags
      // the shell sideways through the constraint — steer it too.
      const iduLat =
        this.physics.velocity.x * this.right.x +
        this.physics.velocity.z * this.right.z;
      this.physics.velocity.x -= this.right.x * iduLat * latBlend;
      this.physics.velocity.z -= this.right.z * iduLat * latBlend;

      const av = shell.angularVelocity;
      const rollAlong = av.x * this.right.x + av.z * this.right.z;
      const rollBlend = 1 - Math.exp(-ROLL_ALIGN * runtimeGrip.scale * dt);
      av.x -= (av.x - this.right.x * rollAlong) * rollBlend;
      av.z -= (av.z - this.right.z * rollAlong) * rollBlend;
    }

    this.physics.position.vsub(shell.position, this.rel);
    const spring = coasting ? BRAKE_SPRING : CENTER_SPRING * 0.28;
    this.force.set(-this.rel.x * spring, 0, -this.rel.z * spring);
    this.physics.applyForce(this.force, this.physics.position);

    // Damp the pendulum's swing relative to the shell. Without this the
    // brake spring overshoots and rolls the ball backwards after stopping.
    const relDamp = coasting ? PENDULUM_DAMP_BRAKE : PENDULUM_DAMP;
    this.force.set(
      -(this.physics.velocity.x - shell.velocity.x) * relDamp,
      0,
      -(this.physics.velocity.z - shell.velocity.z) * relDamp,
    );
    this.physics.applyForce(this.force, this.physics.position);

    if (coasting) {
      this.force.set(-shell.velocity.x * 9, 0, -shell.velocity.z * 9);
      this.physics.applyForce(this.force, this.physics.position);
    }

    this.pose.setFromEuler(0, heading, 0);
    this.physics.quaternion.copy(this.pose);
    this.physics.angularVelocity.set(0, 0, 0);
  }

  syncMesh(): void {
    const { position, quaternion } = this.physics;
    this.mesh.position.set(position.x, position.y, position.z);
    this.mesh.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    this.leftWheel.rotation.x = this.wheelAngle;
    this.rightWheel.rotation.x = this.wheelAngle;
    this.flywheel.rotation.y = this.flyAngle;
  }
}

/** Drive wheel radius: wheels press against the shell's inner surface. */
const DRIVE_WHEEL_R = 0.12;

interface IduParts {
  group: THREE.Group;
  leftWheel: THREE.Object3D;
  rightWheel: THREE.Object3D;
  flywheel: THREE.Object3D;
}

/**
 * Real BB-8 internals (hamster-drive layout, per film/Sphero teardowns):
 * a two-wheel drive cart rides the bottom of the shell, battery ballast
 * hangs below it, a gyro flywheel stabilises, and a central mast carries
 * the spring-loaded roller + magnet plate that holds the head on top.
 * Group origin = pendulum pivot, PENDULUM_LENGTH below shell centre.
 */
function createIduMesh(): IduParts {
  const group = new THREE.Group();
  const dark = metal(COLORS.dark);
  const steel = metal(COLORS.steel);
  const rubber = plastic(0x26262a, { roughness: 0.9, metalness: 0 });

  // Chassis plate.
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.025, 0.24), dark);
  chassis.position.y = -0.03;
  group.add(chassis);

  // Drive wheels: tire + hub, wrapped in spin groups so rotation.x rolls
  // them around their own axle.
  const tireGeo = new THREE.CylinderGeometry(DRIVE_WHEEL_R, DRIVE_WHEEL_R, 0.055, 28);
  tireGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.06, 16);
  hubGeo.rotateZ(Math.PI / 2);
  const makeWheel = (x: number): THREE.Group => {
    const spin = new THREE.Group();
    spin.position.set(x, -0.11, 0);
    const tire = new THREE.Mesh(tireGeo, rubber);
    const hub = new THREE.Mesh(hubGeo, steel);
    spin.add(tire, hub);
    group.add(spin);
    return spin;
  };
  const leftWheel = makeWheel(-0.15);
  const rightWheel = makeWheel(0.15);

  // Motors + gearboxes driving each wheel.
  const motorGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.1, 14);
  motorGeo.rotateZ(Math.PI / 2);
  for (const side of [-1, 1]) {
    const motor = new THREE.Mesh(motorGeo, steel);
    motor.position.set(side * 0.06, -0.11, 0.0);
    const gearbox = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.05), dark);
    gearbox.position.set(side * 0.115, -0.11, 0);
    group.add(motor, gearbox);
  }

  // Battery pack: the main ballast, slung as low as possible.
  const battery = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.07, 0.14),
    plastic(0x2c3e50, { roughness: 0.6 }),
  );
  battery.position.y = -0.145;
  group.add(battery);

  // Gyro flywheel on the chassis (spins to stabilise).
  const flywheel = new THREE.Group();
  flywheel.position.y = 0.0;
  const flyDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.018, 24), steel);
  const flySpokes = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.02, 0.02), dark);
  flywheel.add(flyDisc, flySpokes);
  group.add(flywheel);

  // Electronics board beside the gyro.
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.008, 0.08),
    plastic(0x1e5c34, { roughness: 0.5 }),
  );
  board.position.set(0.11, 0.005, 0.06);
  group.add(board);

  // Central mast up to the head carrier.
  const mastTop = 0.8;
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.016, mastTop + 0.02, 10),
    metal(COLORS.silver),
  );
  mast.position.y = (mastTop - 0.02) / 2;
  group.add(mast);

  // Suspension spring coil around the mast base.
  for (let i = 0; i < 6; i += 1) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.005, 8, 20), steel);
    coil.rotation.x = Math.PI / 2;
    coil.position.y = 0.03 + i * 0.022;
    group.add(coil);
  }

  // Head carrier: plate, caster rollers that glide on the shell's inner
  // top, and the magnets that hold the head through the shell.
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.075, 0.014, 20), dark);
  plate.position.y = mastTop;
  group.add(plate);
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    const roller = new THREE.Mesh(new THREE.SphereGeometry(0.017, 12, 10), steel);
    roller.position.set(Math.cos(a) * 0.062, mastTop + 0.016, Math.sin(a) * 0.062);
    group.add(roller);
  }
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const magnet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.01, 12),
      metal(0x2f6fe0),
    );
    magnet.position.set(Math.cos(a) * 0.035, mastTop + 0.012, Math.sin(a) * 0.035);
    group.add(magnet);
  }

  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
    }
  });

  return { group, leftWheel, rightWheel, flywheel };
}
