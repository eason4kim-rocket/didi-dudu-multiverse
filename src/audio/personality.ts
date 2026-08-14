import type { ControlState } from "../control/commands";
import type { Chirps } from "./chirps";

export class Personality {
  private wasDriving = false;
  private wasLooking = false;
  private nextAmbient = 0;

  update(audio: Chirps, state: ControlState, speed: number): void {
    audio.updateRoll(speed);
    const driving = Math.abs(state.drive) > 0.12 || speed > 0.45;
    const looking = Math.abs(state.lookYaw) > 0.14 || Math.abs(state.lookPitch) > 0.08;
    const now = performance.now();

    if (driving && !this.wasDriving) {
      audio.play("chirp", 0.07);
      this.nextAmbient = now + 1600;
    } else if (!driving && this.wasDriving && speed < 0.5) {
      audio.play("curious", 0.055);
    }

    if (looking && !this.wasLooking) {
      audio.play("curious", 0.05);
    }

    if (driving && now > this.nextAmbient) {
      audio.play("chirp", 0.045);
      this.nextAmbient = now + 1500 + Math.random() * 1400;
    }

    this.wasDriving = driving;
    this.wasLooking = looking;
  }
}
