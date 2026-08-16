import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DOMES, ROCKS } from "../sim/terrain";
import { HF_N, HF_SIZE, heightAtWorld } from "../sim/heightfield";
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

  /**
   * 世界生机 + 无头状态, composed into one canvas filter (whole frame, no
   * render-path change): vitality drains colour as 迪迪 strips a world; losing
   * the head dims, desaturates and blurs the view — the blind-ball feeling.
   */
  setVitality(v: number): void {
    this.vitality = v;
    this.applyFilter();
  }

  setHeadless(on: boolean): void {
    this.headless = on;
    this.applyFilter();
  }

  private vitality = 1;
  private headless = false;

  private applyFilter(): void {
    let sat = 0.12 + 0.88 * this.vitality; // never fully mono — a ghost of colour remains
    let bright = 0.72 + 0.28 * this.vitality; // drained worlds go a touch colder
    let blur = 0;
    if (this.headless) {
      sat *= 0.45; // colour drains out of a headless, half-conscious 迪迪
      bright *= 0.55; // the world goes dim
      blur = 3.5; // ...and out of focus — it can't really see
    }
    this.renderer.domElement.style.filter = `saturate(${sat.toFixed(3)}) brightness(${bright.toFixed(3)}) blur(${blur}px)`;
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
    } else if (u.sky === "moon") {
      canvas = makeMoonSky();
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
    // Displace a grid by the SAME height function the physics Heightfield uses,
    // so the terrain you see is exactly what 迪迪 rolls over. The bump map then
    // adds micro-relief on top of the macro landforms.
    const geo = new THREE.PlaneGeometry(HF_SIZE, HF_SIZE, HF_N, HF_N);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      // Pre-rotation vertex (vx, vy) maps to world (vx, h, -vy) once the mesh
      // is laid flat, so sample height at world (vx, -vy).
      const h = heightAtWorld(pos.getX(i), -pos.getY(i), u.id);
      pos.setZ(i, h);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    const ground = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        map: makeSandTexture(u.sandBase, u.sandFleck),
        bumpMap: makeGroundBump(u.cratered),
        bumpScale: u.bumpScale,
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

/**
 * Grayscale relief for the ground's bump map (bright = high). Deserts and ice
 * get wind-blown grain + soft lumps; the Moon adds real impact craters
 * (dark floor, bright raised rim) so raking sunlight carves them out.
 */
function makeGroundBump(cratered: boolean): THREE.CanvasTexture {
  const S = 512;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }
  ctx.fillStyle = "#808080"; // mid grey = flat
  ctx.fillRect(0, 0, S, S);

  // Fine grain: micro-relief speckle.
  for (let i = 0; i < 9000; i += 1) {
    const g = Math.round(128 + (Math.random() * 2 - 1) * 66);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 1, 1);
  }
  // Soft lumps: gentle rolling bumps and dips.
  for (let i = 0; i < 44; i += 1) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const r = 8 + Math.random() * 42;
    const up = Math.random() < 0.5;
    const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
    blob.addColorStop(0, up ? "rgba(205,205,205,0.5)" : "rgba(58,58,58,0.5)");
    blob.addColorStop(1, "rgba(128,128,128,0)");
    ctx.fillStyle = blob;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  if (cratered) {
    for (let i = 0; i < 26; i += 1) {
      const x = Math.random() * S;
      const y = Math.random() * S;
      const r = 6 + Math.random() * 46;
      const crater = ctx.createRadialGradient(x, y, 0, x, y, r);
      crater.addColorStop(0, "rgba(68,68,68,0.85)"); // sunken floor
      crater.addColorStop(0.72, "rgba(96,96,96,0.5)");
      crater.addColorStop(0.86, "rgba(216,216,216,0.85)"); // raised rim
      crater.addColorStop(1, "rgba(128,128,128,0)");
      ctx.fillStyle = crater;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  const rep = cratered ? 6 : 12;
  texture.repeat.set(rep, rep);
  return texture;
}

/** Airless lunar sky: pure black, crisp dense stars, Earth hanging in it. */
function makeMoonSky(): HTMLCanvasElement {
  const W = 2048;
  const H = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#01010a");
  grad.addColorStop(1, "#050608");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // No atmosphere → stars are sharp and everywhere, right down to the horizon.
  for (let i = 0; i < 4200; i += 1) {
    const x = Math.random() * W;
    const y = Math.random() * H * 0.98;
    const b = 0.35 + Math.random() * 0.65;
    ctx.fillStyle = `rgba(255,255,255,${b.toFixed(2)})`;
    ctx.fillRect(x, y, Math.random() < 0.88 ? 1 : 2, 1);
  }
  for (let i = 0; i < 40; i += 1) {
    const x = Math.random() * W;
    const y = Math.random() * H * 0.7;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 6);
    glow.addColorStop(0, "rgba(255,255,255,0.95)");
    glow.addColorStop(1, "rgba(205,222,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - 6, y - 6, 12, 12);
  }

  // Earth, half-lit, hanging in the black — the iconic view from the surface.
  const ex = W * 0.2;
  const ey = H * 0.27;
  const er = 66;
  const halo = ctx.createRadialGradient(ex, ey, er * 0.6, ex, ey, er * 2.3);
  halo.addColorStop(0, "rgba(120,170,255,0.32)");
  halo.addColorStop(1, "rgba(120,170,255,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(ex - er * 2.3, ey - er * 2.3, er * 4.6, er * 4.6);

  ctx.save();
  ctx.beginPath();
  ctx.arc(ex, ey, er, 0, Math.PI * 2);
  ctx.clip();
  const disc = ctx.createLinearGradient(ex - er, ey - er, ex + er, ey + er);
  disc.addColorStop(0, "#2f63b4");
  disc.addColorStop(1, "#12347a");
  ctx.fillStyle = disc;
  ctx.fillRect(ex - er, ey - er, er * 2, er * 2);
  for (let i = 0; i < 12; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.random() * er * 0.92;
    const x = ex + Math.cos(a) * rr;
    const y = ey + Math.sin(a) * rr;
    const r = 6 + Math.random() * 16;
    ctx.fillStyle = Math.random() < 0.5 ? "rgba(74,124,74,0.7)" : "rgba(240,245,255,0.6)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Terminator: the far limb falls into night.
  const shade = ctx.createLinearGradient(ex - er, ey, ex + er, ey);
  shade.addColorStop(0, "rgba(0,0,12,0)");
  shade.addColorStop(0.62, "rgba(0,0,12,0.12)");
  shade.addColorStop(1, "rgba(0,0,12,0.86)");
  ctx.fillStyle = shade;
  ctx.fillRect(ex - er, ey - er, er * 2, er * 2);
  ctx.restore();

  return canvas;
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
