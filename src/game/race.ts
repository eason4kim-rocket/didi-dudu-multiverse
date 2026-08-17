import * as THREE from "three";
import { t } from "../i18n";
import { heightAtWorld } from "../sim/heightfield";

/**
 * Multiverse time-trial. One fixed course of glowing gates loops around the
 * arena; you roll 迪迪 (BB-8) through them in order against the clock. The
 * track never changes between universes — the *physics* does (gravity,
 * friction, grip), so each world posts its own best time. That's the whole
 * point: same laps, different handling.
 *
 * Gate placement dodges the near/mid dune footprints in sim/terrain.ts but
 * hugs a few so low-gravity worlds launch you off them.
 */

export type RaceEvent = "start" | "gate" | "finish" | "record" | null;

const COURSE: ReadonlyArray<readonly [number, number]> = [
  [0, 6], // start line, just ahead of BB-8's spawn
  [11, 6],
  [14, -4],
  [7, -13],
  [-6, -15],
  [-14, -6],
  [-13, 6],
  [-3, 9], // finish, back near the start
];

const RING_R = 1.3;
const TUBE = 0.12;
const TRIGGER = 1.25; // horizontal distance from gate centre that counts as "through"
const TRIGGER_SQ = TRIGGER * TRIGGER;

const COL_ACTIVE = 0xffd24a; // next gate: glowing gold
const COL_UPCOMING = 0x59a5ff; // later gates: cool blue
const COL_PASSED = 0x35d17e; // done: green

interface Gate {
  readonly center: THREE.Vector3;
  readonly group: THREE.Group;
  readonly ring: THREE.Mesh;
  readonly pad: THREE.Mesh;
}

export interface RaceHud {
  timer?: HTMLElement | null;
  progress?: HTMLElement | null;
  best?: HTMLElement | null;
  prompt?: HTMLElement | null;
}

export class Race {
  readonly mesh = new THREE.Group();

  private readonly gates: Gate[] = [];
  private readonly beam: THREE.Mesh;

  private state: "idle" | "running" | "finished" = "idle";
  private nextIndex = 0;
  private startMs = 0;
  private elapsed = 0;
  private universeId = "";
  private best: number | null = null;
  private lastWasRecord = false;

  constructor(private readonly hud: RaceHud = {}) {
    const tangent = new THREE.Vector3();
    for (let i = 0; i < COURSE.length; i += 1) {
      const [x, z] = COURSE[i];

      // Face each ring toward where you enter it from, so you roll straight
      // through the hole. Gate 0 faces BB-8's spawn at the origin.
      const [px, pz] = i > 0 ? COURSE[i - 1] : [0, 0];
      tangent.set(x - px, 0, z - pz);

      const group = new THREE.Group();
      group.position.set(x, 0, z);
      group.rotation.y = Math.atan2(tangent.x, tangent.z);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(RING_R, TUBE, 14, 44),
        new THREE.MeshStandardMaterial({
          color: 0x0e1216,
          emissive: COL_UPCOMING,
          emissiveIntensity: 0.3,
          roughness: 0.4,
          metalness: 0.3,
        }),
      );
      ring.position.y = RING_R; // bottom tangent to the ground
      group.add(ring);

      // Flat ground marker so the spot still reads when the ring is edge-on.
      const pad = new THREE.Mesh(
        new THREE.RingGeometry(RING_R * 0.72, RING_R * 0.96, 36),
        new THREE.MeshBasicMaterial({
          color: COL_UPCOMING,
          transparent: true,
          opacity: 0.22,
          side: THREE.DoubleSide,
          depthWrite: false,
          fog: false,
        }),
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.y = 0.02;
      group.add(pad);

      this.mesh.add(group);
      this.gates.push({ center: new THREE.Vector3(x, 0, z), group, ring, pad });
    }

    // A light pillar parked over the active gate so you can find it from afar.
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 8, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: COL_ACTIVE,
        transparent: true,
        opacity: 0.13,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    this.beam.position.y = 4;
    this.mesh.add(this.beam);

    this.refreshStyles();
    this.renderHud();
  }

  /** Switch worlds: load that universe's best time and re-arm the run. */
  setUniverse(id: string): void {
    this.universeId = id;
    this.best = loadBest(id);
    // Sit each gate on this world's terrain instead of the old flat y=0.
    for (const gate of this.gates) {
      gate.group.position.y = heightAtWorld(gate.center.x, gate.center.z, id);
    }
    this.reset();
  }

  reset(): void {
    this.state = "idle";
    this.nextIndex = 0;
    this.elapsed = 0;
    this.lastWasRecord = false;
    this.refreshStyles();
    this.renderHud();
  }

  /** Feed BB-8's position each frame; returns an event for sound/celebration. */
  update(pos: { x: number; z: number }, nowMs: number): RaceEvent {
    this.animate(nowMs);
    if (this.state === "running") {
      this.elapsed = nowMs - this.startMs;
    }

    let event: RaceEvent = null;
    if (this.state !== "finished" && this.nextIndex < this.gates.length) {
      const g = this.gates[this.nextIndex];
      const dx = pos.x - g.center.x;
      const dz = pos.z - g.center.z;
      if (dx * dx + dz * dz < TRIGGER_SQ) {
        event = this.advance(nowMs);
      }
    }
    this.renderHud();
    return event;
  }

  private advance(nowMs: number): RaceEvent {
    const wasStart = this.state === "idle";
    if (wasStart) {
      this.state = "running";
      this.startMs = nowMs;
      this.elapsed = 0;
    }
    this.nextIndex += 1;
    this.refreshStyles();

    if (this.nextIndex >= this.gates.length) {
      this.state = "finished";
      this.elapsed = nowMs - this.startMs;
      const record = this.best === null || this.elapsed < this.best;
      this.lastWasRecord = record;
      if (record) {
        this.best = this.elapsed;
        saveBest(this.universeId, this.elapsed);
      }
      return record ? "record" : "finish";
    }
    return wasStart ? "start" : "gate";
  }

  private animate(nowMs: number): void {
    const active =
      this.state !== "finished" && this.nextIndex < this.gates.length
        ? this.gates[this.nextIndex]
        : null;
    if (active) {
      const mat = active.ring.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.9 + 0.5 * Math.sin(nowMs / 240);
      this.beam.visible = true;
      this.beam.position.set(active.center.x, 4 + active.group.position.y, active.center.z);
    } else {
      this.beam.visible = false;
    }
  }

  private refreshStyles(): void {
    for (let i = 0; i < this.gates.length; i += 1) {
      const g = this.gates[i];
      const ring = g.ring.material as THREE.MeshStandardMaterial;
      const pad = g.pad.material as THREE.MeshBasicMaterial;
      if (i < this.nextIndex) {
        ring.emissive.setHex(COL_PASSED);
        ring.emissiveIntensity = 0.42;
        pad.color.setHex(COL_PASSED);
        pad.opacity = 0.16;
      } else if (i === this.nextIndex && this.state !== "finished") {
        ring.emissive.setHex(COL_ACTIVE);
        ring.emissiveIntensity = 1.2; // pulsed in animate()
        pad.color.setHex(COL_ACTIVE);
        pad.opacity = 0.4;
      } else {
        ring.emissive.setHex(COL_UPCOMING);
        ring.emissiveIntensity = 0.28;
        pad.color.setHex(COL_UPCOMING);
        pad.opacity = 0.22;
      }
    }
  }

  private renderHud(): void {
    const { timer, progress, best, prompt } = this.hud;
    if (timer) {
      timer.textContent = formatTime(this.state === "idle" ? 0 : this.elapsed);
    }
    if (progress) {
      progress.textContent = `${Math.min(this.nextIndex, this.gates.length)} / ${this.gates.length}`;
    }
    if (best) {
      best.textContent =
        this.best === null ? t("race.bestNone") : t("race.best", { t: formatTime(this.best) });
    }
    if (prompt) {
      if (this.state === "idle") {
        prompt.textContent = t("race.idle");
      } else if (this.state === "running") {
        prompt.textContent = t("race.running", { n: this.gates.length - this.nextIndex });
      } else {
        prompt.textContent = this.lastWasRecord
          ? t("race.recordFinish", { t: formatTime(this.elapsed) })
          : t("race.finish", { t: formatTime(this.elapsed) });
      }
    }
  }
}

function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function bestKey(universeId: string): string {
  return `bb8-race-best-${universeId}`;
}

function loadBest(universeId: string): number | null {
  try {
    const raw = localStorage.getItem(bestKey(universeId));
    if (raw === null) {
      return null;
    }
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function saveBest(universeId: string, ms: number): void {
  try {
    localStorage.setItem(bestKey(universeId), String(ms));
  } catch {
    /* storage unavailable (private mode); best just won't persist */
  }
}
