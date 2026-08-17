import "./style.css";
import * as THREE from "three";
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
import { Beacon } from "./game/beacon";
import { EchoResponder } from "./game/echo";
import { WorldVitality } from "./game/vitality";
import { Parts } from "./game/parts";
import { Director } from "./game/director";
import { heightAtWorld } from "./sim/heightfield";
import { UNIVERSES, runtimeGrip } from "./universes";
import { getLang, onLangChange, t, toggleLang } from "./i18n";

const FIXED_DT = 1 / 60;

const scene = new GameScene(document.body);
const { world, groundMaterial, ballMaterial, wheelMaterial, ballContact, setTerrain } =
  createPhysicsWorld();
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

// 信标碎片: the cold-open McGuffin — off to one side of spawn, its hint beam
// leading the eye across to the 门. Only in the opening world.
const beacon = new Beacon(-5, -3, 0, -6);
beacon.setUniverse(UNIVERSES[0].id);
scene.add(beacon.mesh);

const flashEl = document.querySelector<HTMLElement>("#portal-flash");
const cardEl = document.querySelector<HTMLElement>("#world-card");
const cardNameEl = document.querySelector<HTMLElement>("#world-card-name");
let cardHideTimer = 0;
let worldSwapTimer = 0;

// 回声应答: 迪迪 calls, 独独 answers a beat later — the emotional spine.
const echo = new EchoResponder(buddy, audio);

// 剧情导演: sequences the beats into a walk-through, one guiding line each.
const director = new Director();
const storyEl = document.querySelector<HTMLElement>("#story");
const storyLineEl = document.querySelector<HTMLElement>("#story-line");
let storyKey = "";
let storyHideTimer = 0;
let everLeftDusk = false;
let headRecoveries = 0;

function showStory(key: string): void {
  storyKey = key;
  if (storyLineEl) {
    storyLineEl.textContent = t(key);
  }
  if (storyEl) {
    storyEl.classList.add("show");
    window.clearTimeout(storyHideTimer);
    // The finale line lingers; earlier beats fade after a read.
    if (!director.atFinale) {
      storyHideTimer = window.setTimeout(() => storyEl.classList.remove("show"), 6500);
    }
  }
}

// 世界生机 + 真身零件: take a part, the world dims; 独独 relights it behind you.
const vitality = new WorldVitality();
vitality.setUniverse(UNIVERSES[0].id);
const parts = new Parts();
parts.setUniverse(UNIVERSES[0].id);
scene.add(parts.mesh);
let vitalityApplied = 1;

// --- 无头状态: a hard crash knocks 迪迪's head off (easier the heavier it is).
// The world dims, sound muffles, it can't emote — until 独独 fetches the head. ---
const headPos = new THREE.Vector3();
let pendingLoseHead = false;
let headlessCooldown = 0; // can't lose the head again for a bit after
let headlessElapsed = 0; // time since it came off (frame-clock), gates recovery
let wasDetached = false;

function loseHead(): void {
  if (head.detached) {
    return;
  }
  head.detach(world, groundMaterial, body.physics.velocity);
  scene.setHeadless(true);
  audio.setMuffled(true);
  audio.play("scared", 0.1); // one last cry as it comes off
  head.headPosition(headPos);
  buddy.setRescueTarget(headPos);
  headlessCooldown = performance.now() + 4000;
}

function recoverHead(): void {
  if (!head.detached) {
    return;
  }
  head.recover();
  headRecoveries += 1;
  scene.setHeadless(false);
  audio.setMuffled(false);
  buddy.setRescueTarget(null);
  audio.play("excited", 0.09); // reunited — relief
  body.react("excited");
  head.triggerEmote("excited");
  buddy.triggerEmote("excited");
}

// Hard-crash detection: cannon's collide events don't fire for the Heightfield
// ground, so we measure impact ourselves — a hard landing or slam spikes the
// ball's velocity between frames. Threshold drops with load (变重=更易碎).
let prevVx = 0;
let prevVy = 0;
let prevVz = 0;

function checkCrash(): void {
  const v = body.physics.velocity;
  const dv = Math.hypot(v.x - prevVx, v.y - prevVy, v.z - prevVz);
  prevVx = v.x;
  prevVy = v.y;
  prevVz = v.z;
  if (head.detached || performance.now() < headlessCooldown) {
    return;
  }
  const threshold = 6.5 - Math.min(body.load, 6) * 0.55;
  if (dv > threshold && Math.random() < 0.7) {
    pendingLoseHead = true;
  }
}

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
  setTerrain(u.id); // swap the Heightfield collider to match the new terrain
  world.gravity.set(0, u.gravity, 0);
  ballContact.friction = u.ballFriction;
  runtimeGrip.scale = u.gripScale;
  // Each world keeps its own best lap: switching re-arms the run.
  race.setUniverse(u.id);
  // Each world remembers its own vitality; parts respawn fresh per visit.
  vitality.setUniverse(u.id);
  parts.setUniverse(u.id);
  beacon.setUniverse(u.id); // the shard only lives in the opening world
  if (u.id !== "dusk") {
    everLeftDusk = true; // crossed a portal out of the opening world
  }
  vitalityApplied = vitality.value;
  scene.setVitality(vitalityApplied);
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
  if (storyLineEl && storyKey) {
    storyLineEl.textContent = t(storyKey); // keep the visible beat line in sync
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

  // A headless 迪迪 can't call out or emote — its inputs are just swallowed.
  if (!head.detached) {
    const emote = controller.consumeEmote();
    if (emote) {
      if (drivingBb8) {
        audio.play(emote);
        head.triggerEmote(emote);
        body.react(emote);
        echo.heard(emote); // 独独 answers a beat later
        beacon.provoke(now, body.physics.position); // ...and so does the shard, broken
      } else {
        audio.play(emote, 0.06, 1, "dudu");
        buddy.triggerEmote(emote);
      }
    } else if (drivingBb8) {
      voice.update(audio, controller.state, body.horizontalSpeed());
    }
  } else {
    controller.consumeEmote();
  }
  echo.update(now);

  // Idle acting: when left alone for a while, BB-8 glances around.
  const s = controller.state;
  const inputActive =
    Math.abs(s.drive) > 0.05 ||
    Math.abs(s.turn) > 0.05 ||
    Math.abs(s.lookYaw) > 0.1;
  const bb8Busy = (drivingBb8 && inputActive) || body.horizontalSpeed() > 0.35;
  if (bb8Busy) {
    nextGlance = now + 4200 + Math.random() * 2500;
  } else if (now > nextGlance && !head.busy && !head.detached) {
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

  // 无头状态: measure impact, apply a queued knock-off, steer 独独 to the head,
  // and reunite them the moment 迪迪 or 独独 reaches it.
  checkCrash();
  if (pendingLoseHead) {
    pendingLoseHead = false;
    loseHead();
  }
  if (head.detached) {
    headlessElapsed = wasDetached ? headlessElapsed + dt : 0; // reset on a fresh knock-off
    head.headPosition(headPos);
    buddy.setRescueTarget(headPos);
    // Give the head a second to actually fly off before it can be reclaimed.
    if (headlessElapsed > 1.0) {
      const dBall = Math.hypot(body.physics.position.x - headPos.x, body.physics.position.z - headPos.z);
      const dBuddy = Math.hypot(buddy.physics.position.x - headPos.x, buddy.physics.position.z - headPos.z);
      if (dBall < 1.0 || dBuddy < 1.25) {
        recoverHead();
      }
    }
  }
  wasDetached = head.detached;

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

  // 信标碎片: the shard pulses and calls out in 迪迪's broken voice.
  if (beacon.update(now)) {
    audio.playBroken("chirp", 0.05);
  }

  // 平行宇宙之门: 迪迪 rolling through it hops to the next world.
  if (portal.update(body.physics.position, now) === "enter") {
    audio.play("excited", 0.07);
    head.triggerEmote("excited");
    enterWorld(universeIndex + 1);
  }

  // 真身零件 + 世界生机: taking a part dims this world; 独独 (following) relights it.
  if (parts.update(body.physics.position, now) === "collected") {
    vitality.drain(0.34);
    body.setLoad(parts.totalTaken); // 真实质量: 变真=变重, 迪迪 handles heavier now
    audio.play("excited", 0.06);
    body.react("excited");
    head.triggerEmote("excited");
  }
  if (drivingBb8) {
    vitality.restore(dt, 0.03); // 独独's silent repair, ~11s per notch
  }
  if (Math.abs(vitality.value - vitalityApplied) > 0.002) {
    vitalityApplied = vitality.value;
    scene.setVitality(vitalityApplied);
  }

  // 剧情导演: advance the story when this beat's goal is met, surface the next line.
  const beatChange = director.update({
    nearBeacon:
      UNIVERSES[universeIndex].id === "dusk" &&
      Math.hypot(
        body.physics.position.x - beacon.center.x,
        body.physics.position.z - beacon.center.z,
      ) < 4.5,
    everLeftDusk,
    totalTaken: parts.totalTaken,
    headRecoveries,
  });
  if (beatChange) {
    showStory(beatChange);
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
    beacon,
    echo,
    vitality,
    parts,
    head,
    director,
    getActiveBot: () => activeBot,
    heightAt: (x: number, z: number) => heightAtWorld(x, z, UNIVERSES[universeIndex].id),
    loseHead,
    headXZ: () => {
      const v = head.headPosition(new THREE.Vector3());
      return { x: v.x, y: v.y, z: v.z };
    },
    setUniverse,
    enterWorld,
  },
});
