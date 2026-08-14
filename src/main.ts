import "./style.css";
import { Chirps } from "./audio/chirps";
import { Personality } from "./audio/personality";
import { createControlState } from "./control/commands";
import { Controller } from "./control/controller";
import { HardwareAdapter } from "./hw/hardware-adapter";
import { GameScene } from "./render/scene";
import { SimAdapter } from "./sim/adapters/sim-adapter";
import { Bb8Body } from "./sim/bb8-body";
import { Bb8Head } from "./sim/bb8-head";
import { Buddy } from "./sim/buddy";
import { createPhysicsWorld } from "./sim/world";
import { UNIVERSES, runtimeGrip } from "./universes";

const FIXED_DT = 1 / 60;

const scene = new GameScene(document.body);
const { world, ballMaterial, wheelMaterial, ballContact } = createPhysicsWorld();
const body = new Bb8Body(ballMaterial);
const head = new Bb8Head();
const buddy = new Buddy(wheelMaterial);
const sim = new SimAdapter(body, head);
const hardware = new HardwareAdapter();
const controller = new Controller();
const audio = new Chirps();
const voice = new Personality();

body.attach(world);
buddy.attach(world);
scene.add(body.mesh);
scene.add(body.idu.mesh);
scene.add(head.mesh);
scene.add(buddy.mesh);

const statusEl = document.querySelector("#hw-status");
const serialBtn = document.querySelector("#btn-serial");
const bleBtn = document.querySelector("#btn-ble");
const cutawayBtn = document.querySelector("#btn-cutaway");
const switchBtn = document.querySelector("#btn-switch");
let cutaway = false;

const IDLE_STATE = createControlState();
let activeBot: "bb8" | "dudu" = "bb8";

function setActiveBot(bot: "bb8" | "dudu"): void {
  activeBot = bot;
  if (switchBtn instanceof HTMLButtonElement) {
    switchBtn.textContent = bot === "bb8" ? "操控独独" : "操控迪迪";
  }
}

// --- Multiverse: each universe swaps scenery AND physics. ---
const universeBtn = document.querySelector("#btn-universe");
let universeIndex = 0;

function setUniverse(index: number): void {
  universeIndex = ((index % UNIVERSES.length) + UNIVERSES.length) % UNIVERSES.length;
  const u = UNIVERSES[universeIndex];
  scene.applyUniverse(u);
  world.gravity.set(0, u.gravity, 0);
  ballContact.friction = u.ballFriction;
  runtimeGrip.scale = u.gripScale;
  if (universeBtn instanceof HTMLButtonElement) {
    universeBtn.textContent = `宇宙：${u.name}`;
  }
}

universeBtn?.addEventListener("click", () => {
  setUniverse(universeIndex + 1);
});

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyU" && !event.repeat) {
    setUniverse(universeIndex + 1);
  }
});

switchBtn?.addEventListener("click", () => {
  setActiveBot(activeBot === "bb8" ? "dudu" : "bb8");
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Tab") {
    event.preventDefault();
    if (!event.repeat) {
      setActiveBot(activeBot === "bb8" ? "dudu" : "bb8");
    }
  }
});

hardware.onStatus = (status) => {
  if (statusEl) {
    statusEl.textContent = status;
  }
};

serialBtn?.addEventListener("click", () => {
  hardware.connectSerial().catch((error: Error) => {
    if (error.name !== "NotFoundError" && error.name !== "AbortError") {
      hardware.onStatus?.(`串口失败：${error.message}`, null);
    }
  });
});

bleBtn?.addEventListener("click", () => {
  hardware.connectBluetooth().catch((error: Error) => {
    if (error.name !== "NotFoundError" && error.name !== "AbortError") {
      hardware.onStatus?.(`蓝牙失败：${error.message}`, null);
    }
  });
});

function setCutaway(on: boolean): void {
  cutaway = on;
  body.setCutaway(on);
  buddy.setCutaway(on);
  if (cutawayBtn instanceof HTMLButtonElement) {
    cutawayBtn.textContent = on ? "外壳" : "看内部结构";
  }
}

cutawayBtn?.addEventListener("click", () => {
  setCutaway(!cutaway);
});

window.addEventListener("keydown", (event) => {
  if (event.repeat || event.code !== "KeyI") {
    return;
  }
  setCutaway(!cutaway);
});

const unlockAudio = (): void => {
  audio.unlock();
  window.removeEventListener("pointerdown", unlockAudio);
  window.removeEventListener("keydown", unlockAudio);
};
window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("keydown", unlockAudio);

let last = performance.now();
let accumulator = 0;
let nextGlance = performance.now() + 5000;

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  controller.update(dt);
  const drivingBb8 = activeBot === "bb8";
  const bb8State = drivingBb8 ? controller.state : IDLE_STATE;
  hardware.apply(bb8State, dt);

  const emote = controller.consumeEmote();
  if (emote) {
    if (drivingBb8) {
      audio.play(emote);
      head.triggerEmote(emote);
      body.react(emote);
    } else {
      audio.play(emote, 0.06, 1, "dudu");
      buddy.triggerEmote(emote);
    }
  } else if (drivingBb8) {
    voice.update(audio, controller.state, body.horizontalSpeed());
  }

  // Idle acting: when left alone for a while, BB-8 glances around.
  const s = controller.state;
  const inputActive =
    Math.abs(s.drive) > 0.05 ||
    Math.abs(s.turn) > 0.05 ||
    Math.abs(s.lookYaw) > 0.1;
  const bb8Busy = (drivingBb8 && inputActive) || body.horizontalSpeed() > 0.35;
  if (bb8Busy) {
    nextGlance = now + 4200 + Math.random() * 2500;
  } else if (now > nextGlance && !head.busy) {
    head.glance();
    if (Math.random() < 0.4) {
      audio.play("curious", 0.035);
    }
    nextGlance = now + 3800 + Math.random() * 4200;
  }

  accumulator += dt;
  while (accumulator >= FIXED_DT) {
    sim.apply(bb8State, FIXED_DT);
    if (drivingBb8) {
      buddy.update(body, audio, FIXED_DT);
    } else {
      buddy.drive(controller.state, audio, FIXED_DT);
    }
    world.step(FIXED_DT);
    accumulator -= FIXED_DT;
  }

  sim.syncVisuals(bb8State, dt);
  scene.followBody(drivingBb8 ? body : buddy, dt);
  scene.render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Debug handle for automated smoke tests and console poking.
Object.assign(window as unknown as Record<string, unknown>, {
  __bb8: {
    body,
    buddy,
    controller,
    world,
    getActiveBot: () => activeBot,
    setUniverse,
  },
});
