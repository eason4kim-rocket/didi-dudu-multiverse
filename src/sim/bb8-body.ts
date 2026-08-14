import * as CANNON from "cannon-es";
import * as THREE from "three";
import type { ControlState, EmoteKind } from "../control/commands";
import { makeBodyTexture } from "../render/bb8-textures";
import { InternalDriveUnit } from "./bb8-idu";
import {
  BODY_RADIUS,
  BRAKE_ANGULAR_DAMP,
  BRAKE_LINEAR_DAMP,
  DRIVE_ANGULAR_DAMP,
  DRIVE_LINEAR_DAMP,
  HEAD_LEAN_GAIN,
  HEAD_LEAN_MAX,
  SHELL_MASS,
  SPIN_TORQUE,
  TURN_RATE,
} from "./constants";

export class Bb8Body {
  readonly mesh: THREE.Group;
  readonly physics: CANNON.Body;
  readonly idu: InternalDriveUnit;
  heading = 0;

  private celebrateUntil = 0;
  private recoilUntil = 0;
  private readonly reactForce = new CANNON.Vec3();

  constructor(material: CANNON.Material) {
    this.mesh = createBodyMesh();

    this.physics = new CANNON.Body({
      mass: SHELL_MASS,
      material,
      linearDamping: 0.18,
      angularDamping: 0.22,
      allowSleep: false,
      position: new CANNON.Vec3(0, BODY_RADIUS + 0.02, 0),
    });
    this.physics.addShape(new CANNON.Sphere(BODY_RADIUS));
    this.physics.collisionFilterGroup = 1;
    this.physics.collisionFilterMask = 1;

    this.idu = new InternalDriveUnit(this.physics);
  }

  attach(world: CANNON.World): void {
    world.addBody(this.physics);
    world.addBody(this.idu.physics);
    world.addConstraint(this.idu.constraint);
  }

  /** Body acting that goes with an emote: happy spin, scared back-off. */
  react(kind: EmoteKind): void {
    const now = performance.now();
    if (kind === "excited") {
      this.celebrateUntil = now + 900;
    } else if (kind === "scared") {
      this.recoilUntil = now + 380;
    }
  }

  applyControl(state: ControlState, dt: number): void {
    this.heading += state.turn * TURN_RATE * dt;
    const coasting = Math.abs(state.drive) < 0.08;
    this.physics.linearDamping = coasting ? BRAKE_LINEAR_DAMP : DRIVE_LINEAR_DAMP;
    this.physics.angularDamping = coasting ? BRAKE_ANGULAR_DAMP : DRIVE_ANGULAR_DAMP;
    if (coasting && Math.abs(state.turn) > 0.1) {
      this.physics.torque.y += state.turn * SPIN_TORQUE;
    }

    const now = performance.now();
    if (now < this.celebrateUntil) {
      this.physics.torque.y += 10;
    }
    if (now < this.recoilUntil) {
      this.reactForce.set(-Math.sin(this.heading) * 46, 0, -Math.cos(this.heading) * 46);
      this.idu.physics.applyForce(this.reactForce, this.idu.physics.position);
    }

    this.idu.applyControl(this.physics, state, this.heading, dt);
  }

  horizontalSpeed(): number {
    const { x, z } = this.physics.velocity;
    return Math.hypot(x, z);
  }

  /** Sit direction: almost world-up, with a small lean from IDU shift. */
  magnetDirection(out: THREE.Vector3): THREE.Vector3 {
    const idu = this.idu.physics.position;
    const shell = this.physics.position;
    out.set(idu.x - shell.x, 0, idu.z - shell.z);
    out.multiplyScalar(HEAD_LEAN_GAIN);
    if (out.length() > HEAD_LEAN_MAX) {
      out.setLength(HEAD_LEAN_MAX);
    }
    out.y = 1;
    return out.normalize();
  }

  setCutaway(on: boolean): void {
    this.mesh.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return;
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
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
    this.idu.mesh.visible = on;
  }

  syncMesh(): void {
    const { position, quaternion } = this.physics;
    this.mesh.position.set(position.x, position.y, position.z);
    this.mesh.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    this.idu.syncMesh();
  }
}

function createBodyMesh(): THREE.Group {
  const group = new THREE.Group();

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(BODY_RADIUS, 96, 64),
    new THREE.MeshStandardMaterial({
      map: makeBodyTexture(),
      roughness: 0.38,
      metalness: 0.05,
    }),
  );
  shell.castShadow = true;
  shell.receiveShadow = true;
  group.add(shell);

  return group;
}
