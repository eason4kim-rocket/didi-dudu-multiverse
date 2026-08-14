import * as CANNON from "cannon-es";
import { DOMES, ROCKS } from "./terrain";

export function createPhysicsWorld(): {
  world: CANNON.World;
  groundMaterial: CANNON.Material;
  ballMaterial: CANNON.Material;
  wheelMaterial: CANNON.Material;
  ballContact: CANNON.ContactMaterial;
} {
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0),
  });
  world.broadphase = new CANNON.NaiveBroadphase();
  (world.solver as { iterations?: number }).iterations = 20;
  world.defaultContactMaterial.friction = 0.7;
  world.defaultContactMaterial.restitution = 0.05;

  const groundMaterial = new CANNON.Material("ground");
  const ballMaterial = new CANNON.Material("ball");
  // Kept mutable: universe switching retunes friction at runtime.
  const ballContact = new CANNON.ContactMaterial(groundMaterial, ballMaterial, {
    friction: 1.05,
    restitution: 0.02,
  });
  world.addContactMaterial(ballContact);

  // For fake-rolling bodies (a locked-rotation sphere standing in for a
  // wheel). Friction must be exactly 0: cannon-es friction equations pin a
  // fixedRotation body in place at ANY friction > 0 (verified empirically,
  // even 0.02 locks it solid). A rolling tire is ~zero drag anyway; braking
  // comes from linear damping instead.
  const wheelMaterial = new CANNON.Material("wheel");
  world.addContactMaterial(
    new CANNON.ContactMaterial(groundMaterial, wheelMaterial, {
      friction: 0,
      restitution: 0.02,
    }),
  );

  const ground = new CANNON.Body({
    mass: 0,
    material: groundMaterial,
    shape: new CANNON.Plane(),
    collisionFilterGroup: 1,
    collisionFilterMask: 1,
  });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);

  // Dunes: buried spheres — the visible dome caps are solid, so the robots
  // climb them with real contact physics instead of clipping through.
  for (const dome of DOMES) {
    const body = new CANNON.Body({
      mass: 0,
      material: groundMaterial,
      shape: new CANNON.Sphere(dome.r),
      position: new CANNON.Vec3(dome.x, -dome.sink, dome.z),
      collisionFilterGroup: 1,
      collisionFilterMask: 1,
    });
    world.addBody(body);
  }

  // Rocks: static spheres slightly smaller than the visual boulders.
  for (const rock of ROCKS) {
    const body = new CANNON.Body({
      mass: 0,
      material: groundMaterial,
      shape: new CANNON.Sphere(rock.s * 0.9),
      position: new CANNON.Vec3(rock.x, rock.y, rock.z),
      collisionFilterGroup: 1,
      collisionFilterMask: 1,
    });
    world.addBody(body);
  }

  return { world, groundMaterial, ballMaterial, wheelMaterial, ballContact };
}
