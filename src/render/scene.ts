import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DOMES, ROCKS } from "../sim/terrain";
import { UNIVERSES, type Universe } from "../universes";

/** Anything with a physics position the camera can track. */
interface Followable {
  physics: { position: { x: number; y: number; z: number } };
}

export class GameScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  private readonly controls: OrbitControls;
  /** Everything a universe owns (sky, lights, ground...) for hot-swapping. */
  private themed: THREE.Object3D[] = [];

  constructor(host: HTMLElement) {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 80);
    this.camera.position.set(0, 2.2, 4.6);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    host.prepend(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.minDistance = 1.4;
    this.controls.maxDistance = 14;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.04;
    this.controls.target.set(0, 0.97, 0);

    this.applyUniverse(UNIVERSES[0]);
    this.resize();
    window.addEventListener("resize", this.resize);
  }

  /** Tear down the current universe's scenery and build the new one. */
  applyUniverse(u: Universe): void {
    for (const object of this.themed) {
      this.scene.remove(object);
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const m of mats) m.dispose();
        }
      });
    }
    this.themed = [];

    this.scene.background = new THREE.Color(u.background);
    this.scene.fog = new THREE.Fog(u.fog, u.fogNear, u.fogFar);
    this.addSky(u);
    this.addLights(u);
    this.addGround(u);
    this.addDunes(u);
    this.addRocks(u);
  }

  private track(object: THREE.Object3D): void {
    this.themed.push(object);
    this.scene.add(object);
  }

  add(object: THREE.Object3D): void {
    this.scene.add(object);
  }

  followBody(body: Followable, _dt: number): void {
    // Keep the ball centered: shift camera by the target's motion, then let
    // OrbitControls apply the user's drag/zoom around it.
    const pos = body.physics.position;
    const dx = pos.x - this.controls.target.x;
    const dy = pos.y + 0.42 - this.controls.target.y;
    const dz = pos.z - this.controls.target.z;
    this.camera.position.x += dx;
    this.camera.position.y += dy;
    this.camera.position.z += dz;
    this.controls.target.set(pos.x, pos.y + 0.42, pos.z);
    this.controls.update();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener("resize", this.resize);
    this.controls.dispose();
    this.renderer.dispose();
  }

  private readonly resize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  /** Sky dome, per universe: dusk gradient, galaxy night, or snow haze. */
  private addSky(u: Universe): void {
    let canvas: HTMLCanvasElement;
    if (u.sky === "galaxy") {
      canvas = makeGalaxySky();
    } else {
      canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const gradient = ctx.createLinearGradient(0, 0, 0, 256);
        if (u.sky === "dusk") {
          gradient.addColorStop(0, "#8fc0da");
          gradient.addColorStop(0.5, "#dcd5ba");
          gradient.addColorStop(0.76, "#f0cf9d");
          gradient.addColorStop(1, "#e6b880");
        } else {
          // snow: pale winter sky sinking into white haze
          gradient.addColorStop(0, "#9cc4e4");
          gradient.addColorStop(0.5, "#cfe2f0");
          gradient.addColorStop(0.78, "#e9f2f8");
          gradient.addColorStop(1, "#f4f8fb");
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 16, 256);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(60, 48, 32),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, fog: false }),
    );
    this.track(sky);
  }

  private addLights(u: Universe): void {
    const hemi = new THREE.HemisphereLight(u.hemi[0], u.hemi[1], u.hemi[2]);
    this.track(hemi);

    const sun = new THREE.DirectionalLight(u.sun[0], u.sun[1]);
    sun.position.set(8, 14, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 40;
    sun.shadow.camera.left = -16;
    sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 16;
    sun.shadow.camera.bottom = -16;
    this.track(sun);

    const fill = new THREE.DirectionalLight(u.fill[0], u.fill[1]);
    fill.position.set(-6, 4, -8);
    this.track(fill);
  }

  /** Dune domes: rendered exactly where their physics spheres sit. */
  private addDunes(u: Universe): void {
    const material = new THREE.MeshStandardMaterial({
      color: u.duneColor,
      roughness: 1,
      metalness: 0,
    });
    for (const dome of DOMES) {
      const dune = new THREE.Mesh(new THREE.SphereGeometry(dome.r, 40, 28), material);
      dune.position.set(dome.x, -dome.sink, dome.z);
      dune.receiveShadow = true;
      dune.castShadow = true;
      this.track(dune);
    }
  }

  private addGround(u: Universe): void {
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(48, 96),
      new THREE.MeshStandardMaterial({
        map: makeSandTexture(u.sandBase, u.sandFleck),
        roughness: 0.97,
        metalness: 0.02,
        color: u.groundTint,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.track(ground);
  }

  private addRocks(u: Universe): void {
    const material = new THREE.MeshStandardMaterial({
      color: u.rockColor,
      roughness: 0.9,
      metalness: 0.04,
    });
    for (const { x, y, z, s } of ROCKS) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), material);
      rock.position.set(x, y, z);
      rock.rotation.set(0.2, x, 0.4);
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.track(rock);
    }
  }
}

function makeSandTexture(base: string, fleck: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  // Fine grain.
  for (let i = 0; i < 1400; i += 1) {
    ctx.fillStyle = `rgba(${fleck}, ${(0.06 + Math.random() * 0.09).toFixed(2)})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  // Wind-blown streaks.
  for (let i = 0; i < 26; i += 1) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const w = 40 + Math.random() * 120;
    const h = 6 + Math.random() * 14;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.random() * Math.PI);
    const streak = ctx.createLinearGradient(0, 0, w, 0);
    streak.addColorStop(0, `rgba(${fleck},0)`);
    streak.addColorStop(0.5, `rgba(${fleck},0.16)`);
    streak.addColorStop(1, `rgba(${fleck},0)`);
    ctx.fillStyle = streak;
    ctx.fillRect(0, -h / 2, w, h);
    ctx.restore();
  }
  // Pebble patches / crater shadows.
  for (let i = 0; i < 14; i += 1) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 4 + Math.random() * 14;
    const blot = ctx.createRadialGradient(x, y, 0, x, y, r);
    blot.addColorStop(0, `rgba(${fleck},0.3)`);
    blot.addColorStop(1, `rgba(${fleck},0)`);
    ctx.fillStyle = blot;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(12, 12);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Martian night: near-black space, a crisp galaxy arc, dusty horizon. */
function makeGalaxySky(): HTMLCanvasElement {
  const W = 2048;
  const H = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, "#02030a");
  gradient.addColorStop(0.4, "#060a16");
  gradient.addColorStop(0.48, "#120e14");
  gradient.addColorStop(0.5, "#5a3a22");
  gradient.addColorStop(0.52, "#2a1a12");
  gradient.addColorStop(1, "#0a0608");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  const horizon = H * 0.5;
  const bandAt = (x: number) => H * 0.42 - Math.sin((x / W) * Math.PI) * H * 0.12;

  // Nebula haze along the band.
  for (let i = 0; i < 180; i += 1) {
    const x = Math.random() * W;
    const y = bandAt(x) + (Math.random() - 0.5) * H * 0.05;
    const r = 20 + Math.random() * 70;
    const tint = ["200,215,255", "228,214,255", "255,226,208", "214,232,255"][
      Math.floor(Math.random() * 4)
    ];
    const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
    blob.addColorStop(0, `rgba(${tint},${0.1 + Math.random() * 0.1})`);
    blob.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = blob;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Bright core.
  for (let i = 0; i < 90; i += 1) {
    const x = Math.random() * W;
    const y = bandAt(x) + (Math.random() - 0.5) * H * 0.03;
    const r = 8 + Math.random() * 26;
    const core = ctx.createRadialGradient(x, y, 0, x, y, r);
    core.addColorStop(0, "rgba(255,248,235,0.22)");
    core.addColorStop(1, "rgba(255,248,235,0)");
    ctx.fillStyle = core;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Dense band stars.
  for (let i = 0; i < 2600; i += 1) {
    const x = Math.random() * W;
    const y = bandAt(x) + (Math.random() - 0.5) * H * 0.045;
    ctx.fillStyle = `rgba(255,255,255,${(0.5 + Math.random() * 0.5).toFixed(2)})`;
    ctx.fillRect(x, y, Math.random() < 0.85 ? 1 : 2, Math.random() < 0.85 ? 1 : 2);
  }
  // Field stars across the black sky.
  for (let i = 0; i < 1800; i += 1) {
    const x = Math.random() * W;
    const y = Math.random() * horizon * 0.98;
    ctx.fillStyle = `rgba(255,255,255,${(0.3 + Math.random() * 0.7).toFixed(2)})`;
    ctx.fillRect(x, y, Math.random() < 0.9 ? 1 : 2, 1);
  }
  // A few glowing bright stars.
  for (let i = 0; i < 22; i += 1) {
    const x = Math.random() * W;
    const y = Math.random() * horizon * 0.85;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 8);
    glow.addColorStop(0, "rgba(255,255,255,0.9)");
    glow.addColorStop(0.3, "rgba(210,225,255,0.35)");
    glow.addColorStop(1, "rgba(210,225,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - 8, y - 8, 16, 16);
  }
  return canvas;
}
