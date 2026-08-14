import { createControlState, type ControlState, type EmoteKind } from "./commands";
import { MAX_LOOK_PITCH, MAX_LOOK_YAW } from "../sim/constants";

export class Controller {
  readonly state: ControlState = createControlState();

  private readonly held = new Set<string>();
  private lookYaw = 0;
  private lookPitch = 0;

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
  }

  update(dt: number): void {
    const drive =
      (this.held.has("KeyW") ? 1 : 0) + (this.held.has("KeyS") ? -1 : 0);
    const turn =
      (this.held.has("KeyA") ? 1 : 0) + (this.held.has("KeyD") ? -1 : 0);
    const lookYawInput =
      (this.held.has("ArrowLeft") ? 1 : 0) +
      (this.held.has("ArrowRight") ? -1 : 0);
    const lookPitchInput =
      (this.held.has("ArrowUp") ? 1 : 0) +
      (this.held.has("ArrowDown") ? -1 : 0);

    this.lookYaw = clamp(
      this.lookYaw + lookYawInput * 1.6 * dt,
      -MAX_LOOK_YAW,
      MAX_LOOK_YAW,
    );
    this.lookPitch = clamp(
      this.lookPitch + lookPitchInput * 1.1 * dt,
      -MAX_LOOK_PITCH,
      MAX_LOOK_PITCH,
    );

    if (lookYawInput === 0) {
      this.lookYaw += (0 - this.lookYaw) * Math.min(1, 2.8 * dt);
    }
    if (lookPitchInput === 0) {
      this.lookPitch += (0 - this.lookPitch) * Math.min(1, 2.8 * dt);
    }

    this.state.drive = clamp(drive, -1, 1);
    this.state.turn = clamp(turn, -1, 1);
    this.state.lookYaw = this.lookYaw;
    this.state.lookPitch = this.lookPitch;
  }

  consumeEmote(): EmoteKind | null {
    const emote = this.state.emote;
    this.state.emote = null;
    return emote;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) {
      return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      this.state.emote = "chirp";
      return;
    }
    if (event.code === "KeyE") {
      this.state.emote = "excited";
      return;
    }
    if (event.code === "KeyC") {
      this.state.emote = "curious";
      return;
    }
    if (event.code === "KeyY") {
      this.state.emote = "yes";
      return;
    }
    if (event.code === "KeyN") {
      this.state.emote = "no";
      return;
    }
    if (event.code === "KeyQ") {
      this.state.emote = "scared";
      return;
    }
    if (event.code.startsWith("Arrow")) {
      event.preventDefault();
    }
    this.held.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  private readonly onBlur = (): void => {
    this.held.clear();
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
