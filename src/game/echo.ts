import type { Chirps } from "../audio/chirps";
import type { EmoteKind } from "../control/commands";
import type { Buddy } from "../sim/buddy";

/**
 * 回声应答 — the Echo Responder, spine of the whole emotional arc
 * (story-beats.md §1). 迪迪 calls, 独独 answers a beat later.
 *
 * Act 1 makes the answer a reliable habit; Act 2 switches to "silent" so the
 * unanswered chirp aches; Act 3 answers again — same call, new weight. Calls
 * made into the silence are tallied in `unanswered`, a debt a later beat pays
 * back ("它其实一直在"). For now it runs in "answer" mode by default.
 */

export type EchoMode = "answer" | "silent";

export class EchoResponder {
  mode: EchoMode = "answer";
  /** Calls that went out while silent — the ache the story cashes in later. */
  unanswered = 0;

  private pendingKind: EmoteKind | null = null;
  private dueAt = 0;

  constructor(
    private readonly buddy: Buddy,
    private readonly audio: Chirps,
  ) {}

  /** 迪迪 just called. Schedule 独独's reply — or bank the silence. */
  heard(kind: EmoteKind): void {
    if (this.mode === "silent") {
      this.unanswered += 1;
      return;
    }
    this.pendingKind = kind;
    // A beat after the call so it reads as a reply, not an echo-slap — and it
    // clears the Chirps 220ms rate-limit so 独独's voice isn't swallowed.
    this.dueAt = performance.now() + 260 + Math.random() * 180;
  }

  /** Fire any reply that has come due. Call every frame. */
  update(nowMs: number): void {
    if (this.pendingKind && nowMs >= this.dueAt) {
      const kind = this.pendingKind;
      this.pendingKind = null;
      this.buddy.triggerEmote(kind);
      this.audio.play(kind, 0.05, 1, "dudu");
    }
  }

  /** Go quiet (Act 2) or start answering again (Act 3). */
  setMode(mode: EchoMode): void {
    this.mode = mode;
    if (mode === "silent") {
      this.pendingKind = null; // drop any reply still in flight
    }
  }
}
