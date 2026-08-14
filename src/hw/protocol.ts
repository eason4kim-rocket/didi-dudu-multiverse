import type { ControlState, EmoteKind } from "../control/commands";

export const HARDWARE_HZ = 20;

/** Nordic UART Service, common on ESP32 BLE bridges. */
export const NUS_SERVICE = "6e400001-b5a3-f393-e0a3-e24d89100fb4";
export const NUS_RX = "6e400002-b5a3-f393-e0a3-e24d89100fb4";
export const NUS_TX = "6e400003-b5a3-f393-e0a3-e24d89100fb4";

export const EMOTE_CODE: Record<EmoteKind, number> = {
  chirp: 1,
  excited: 2,
  curious: 3,
  yes: 4,
  no: 5,
  scared: 6,
};

/**
 * One JSON line per tick. Same fields as ControlState so firmware
 * can map drive/turn/look/emote straight onto motors and servos.
 */
export function encodeFrame(state: ControlState): string {
  return `${JSON.stringify({
    drive: round(state.drive),
    turn: round(state.turn),
    lookYaw: round(state.lookYaw),
    lookPitch: round(state.lookPitch),
    emote: state.emote ? EMOTE_CODE[state.emote] : 0,
  })}\n`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
