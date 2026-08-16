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
import { Race } from "./game/race";
import { Portal } from "./game/portal";
import { UNIVERSES, runtimeGrip } from "./universes";
import { getLang, onLangChange, t, toggleLang } from "./i18n";

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

const race = new Race({
  timer: document.querySelector<HTMLElement>("#race-timer"),
  progress: document.querySelector<HTMLElement>("#race-progress"),
  best: document.querySelector<HTMLElement>("#race-best"),
  prompt: document.querySelector<HTMLElement>("#race-prompt"),
});
scene.add(race.mesh);
race.setUniverse(UNIVERSES[0].id);

// 平行宇宙之门: roll 迪迪 into it to cross worlds. Parked on open ground
// straight ahead of 迪迪's spawn, clear of the dunes and rocks.
const portal = new Portal(0, -6);
scene.add(portal.mesh);

const flashEl = document.querySelector<HTMLElement>("#portal-flash");
const cardEl = document.querySelector<HTMLElement>("#world-card");
const cardNameEl = document.querySelector<HTMLElement>("#world-card-name");
let cardHideTimer = 0;
let worldSwapTimer = 0;

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
    switchBtn.textContent = t(bot === "bb8" ? "btn.driveDudu" : "btn.driveDidi");
  }
}

// --- Multiverse: each universe swaps scenery AND physics. ---
const universeBtn = document.querySelector("#btn-universe");
let universeIndex = 0;

function universeLabel(): string {
  const u = UNIVERSES[universeIndex];
  return t("universe.prefix") + (getLang() === "en" ? u.nameEn : u.name);
}

function setUniverse(index: number): void {
  universeIndex = ((index % UNIVERSES.length) + UNIVERSES.length) % UNIVERSES.length;
  const u = UNIVERSES[universeIndex];
  scene.applyUniverse(u);
  world.gravity.set(0, u.gravity, 0);
  ballContact.friction = u.ballFriction;
  runtimeGrip.scale = u.gripScale;
  // Each world keeps its own best lap: switching re-arms the run.
  race.setUniverse(u.id);
  if (universeBtn instanceof HTMLButtonElement) {
    universeBtn.textContent = universeLabel();
  }
}

// Cross into a world with a bit of ceremony: a burst of light (which also
// hides the scenery rebuild), the physics swap, then the world's name card.
// The portal, the U key and the button all funnel through here.
function worldName(): string {
  const u = UNIVERSES[((universeIndex % UNIVERSES.length) + UNIVERSES.length) % UNIVERSES.length];
  return getLang() === "en" ? u.nameEn : u.name;
}

function enterWorld(index: number): void {
  if (flashEl) {
    flashEl.classList.remove("go");
    void flashEl.offsetWidth; // reflow so the animation restarts on repeat hops
    flashEl.classList.add("go");
  }
  portal.disarm();
  window.clearTimeout(worldSwapTimer);
  worldSwapTimer = window.setTimeout(() => {
    setUniverse(index);
    if (cardNameEl) {
      cardNameEl.textContent = worldName();
    }
    if (cardEl) {
      cardEl.classList.add("show");
      window.clearTimeout(cardHideTimer);
      cardHideTimer = window.setTimeout(() => cardEl.classList.remove("show"), 1700);
    }
  }, 190);
}

universeBtn?.addEventListener("click", () => {
  enterWorld(universeIndex + 1);
});

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyU" && !event.repeat) {
    enterWorld(universeIndex + 1);
  }
  if (event.code === "KeyR" && !event.repeat) {
    race.reset();
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
      hardware.onStatus?.(t("hw.serialFail", { msg: error.message }), null);
    }
  });
});

bleBtn?.addEventListener("click", () => {
  hardware.connectBluetooth().catch((error: Error) => {
    if (error.name !== "NotFoundError" && error.name !== "AbortError") {
      hardware.onStatus?.(t("hw.bleFail", { msg: error.message }), null);
    }
  });
});

function setCutaway(on: boolean): void {
  cutaway = on;
  body.setCutaway(on);
  buddy.setCutaway(on);
  if (cutawayBtn instanceof HTMLButtonElement) {
    cutawayBtn.textContent = t(on ? "btn.cutawayOff" : "btn.cutawayOn");
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

// --- Language toggle: 中文 / English (button, or the L key). ---
const langBtn = document.querySelector("#btn-lang");

function applyLang(): void {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (key) {
      el.textContent = t(key);
    }
  });
  if (switchBtn instanceof HTMLButtonElement) {
    switchBtn.textContent = t(activeBot === "bb8" ? "btn.driveDudu" : "btn.driveDidi");
  }
  if (cutawayBtn instanceof HTMLButtonElement) {
    cutawayBtn.textContent = t(cutaway ? "btn.cutawayOff" : "btn.cutawayOn");
  }
  if (universeBtn instanceof HTMLButtonElement) {
    universeBtn.textContent = universeLabel();
  }
  if (langBtn instanceof HTMLButtonElement) {
    langBtn.textContent = getLang() === "zh" ? "EN" : "中文";
  }
}

langBtn?.addEventListener("click", () => {
  toggleLang();
});
window.addEventListener("keydown", (event) => {
  if (event.code === "KeyL" && !event.repeat) {
    toggleLang();
  }
});
onLangChange(applyLang);
applyLang();

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

  // Time-trial: the race always tracks 迪迪, so gates only tick when BB-8
  // actually rolls through them. Reward gates and the finish with a chirp.
  const raceEvent = race.update(body.physics.position, now);
  if (raceEvent === "start" || raceEvent === "gate") {
    audio.play("chirp", 0.05);
  } else if (raceEvent === "finish" || raceEvent === "record") {
    audio.play("excited", raceEvent === "record" ? 0.09 : 0.06);
    body.react("excited");
    head.triggerEmote("excited");
  }

  // 平行宇宙之门: 迪迪 rolling through it hops to the next world.
  if (portal.update(body.physics.position, now) === "enter") {
    audio.play("excited", 0.07);
    head.triggerEmote("excited");
    enterWorld(universeIndex + 1);
  }

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
    race,
    portal,
    getActiveBot: () => activeBot,
    setUniverse,
    enterWorld,
  },
});
