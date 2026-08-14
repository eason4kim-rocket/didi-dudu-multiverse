/** Shared command vocabulary for the sim now and hardware later. */

export type EmoteKind = "chirp" | "excited" | "curious" | "yes" | "no" | "scared";

export interface ControlState {
  /** Forward / back, -1 to 1. Maps to the internal drive wheel. */
  drive: number;
  /** Yaw rate, -1 to 1. Maps to turning the internal yaw unit. */
  turn: number;
  /** Head yaw offset from travel heading, radians. */
  lookYaw: number;
  /** Head pitch, radians. Positive looks up. */
  lookPitch: number;
  /** One-shot expression. Consumed after the actuator sees it. */
  emote: EmoteKind | null;
}

export function createControlState(): ControlState {
  return {
    drive: 0,
    turn: 0,
    lookYaw: 0,
    lookPitch: 0,
    emote: null,
  };
}

export interface Actuator {
  apply(state: ControlState, dt: number): void;
}
